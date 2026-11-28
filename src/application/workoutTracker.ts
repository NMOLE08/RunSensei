import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import type { SqlDatabase } from '@/data/database';
import { migrate } from '@/data/migrations';
import { acceptTrackPoint, breakTrackSegment, emptyTrack, type TrackPoint, type TrackState } from '@/domain/tracking/metrics';
import { assertValidRecordingTimeline, transitionSession, type RecordingSegment, type TrackingMetricVersion, type TrainingSession } from '@/domain/tracking/session';
import type { CompletedKmSplit, MetricEdgeEvidence, MetricsRefreshHealth, MetricsRefreshStage, PersistedGpsQuality } from '@/domain/tracking/liveRunMetrics';
import { loadActiveGpsBinding, loadGpsState, loadKmSplits, loadLiveMetricEdges, qualityFromRow } from '@/data/trackingMetricsRepository';
import { getTrackerOwnerId } from './trackerIdentity';
import { trackerOnly } from '@/config/productMode';
import { retainPendingResearchCheckin } from './researchCheckin';
import { recordGpsDiagnostic } from './gpsDiagnostics';
import { acquireGpsSessionBinding, activateGpsPipelineAnchor, BACKGROUND_GPS_TASK, commitGpsResume, compensateGpsResumeFailure, confirmGpsResume, flushGpsWrites, loadGpsSessionBindingForOwner, loadPendingGpsAccountTransition, markGpsAccountTransitionPending, markGpsResumeRecoveryRequired, persistLocationBatch, releaseGpsSessionBinding, restoreRouteState, serializeGpsWrite, setGpsBindingLifecycle, setGpsRecordingCutoff, type TrustedPipelineAnchor } from './backgroundGpsTask';

type SavedRow = { id: string; owner_id: string; planned_session_id: string | null; revision_id: string | null; prescription_json: string | null; mode: 'run' | 'walk'; state: TrainingSession['status']; started_at_ms: number; ended_at_ms: number | null; checkpoint_at_ms: number; segments_json: string; distance_meters: number | null; status_reason: string | null; metric_version: TrackingMetricVersion };
type SavedPoint = { timestamp_ms: number; latitude: number; longitude: number; accuracy_meters: number; segment: number };
export type TrackerSnapshot = { session: TrainingSession; revisionId: string | null; track: TrackState; metricEdges: readonly MetricEdgeEvidence[] | null; completedKmSplits: readonly CompletedKmSplit[] | null; gpsQuality: PersistedGpsQuality; refreshHealth: MetricsRefreshHealth; timerOnly: boolean; message: string | null; researchCheckIn?: { blockId: string; assignmentId: string } };
let current: TrackerSnapshot | null = null;
let busy = false;
let trackerRevision = 0;
let lastProgressCheckpoint = 0;
let checkpointTimer: ReturnType<typeof setInterval> | null = null;
let schemaReady = false;
let refreshSequence = 0;
let refreshHealth: MetricsRefreshHealth = { status: 'current', lastAttemptMs: null, lastSuccessMs: null, snapshotCheckpointAtMs: null, snapshotAgeMs: null, errorStage: null, errorCode: null };
const listeners = new Set<(value: TrackerSnapshot | null) => void>();
const emit = () => listeners.forEach((listener) => listener(current));
const db = async () => { const database = await openAppDatabase(); if (!schemaReady) { await migrate(database, new Date().toISOString()); schemaReady = true; } return database; };

function refreshErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission/i.test(message)) return 'permission_unavailable';
  if (/database|sqlite|sql/i.test(message)) return 'database_unavailable';
  if (/timeline|segment/i.test(message)) return 'invalid_timeline';
  if (/session|owner|binding/i.test(message)) return 'session_unavailable';
  return 'refresh_failed';
}

function refreshOutcomeEligible(attempt: number, revision: number, sessionId: string | null): boolean {
  return attempt === refreshSequence && revision === trackerRevision && (sessionId === null || current?.session.id === sessionId);
}

function refreshFailure(stage: MetricsRefreshStage, error: unknown, attempt: number, attemptAtMs: number, revision: number, sessionId: string | null): void {
  if (!refreshOutcomeEligible(attempt, revision, sessionId)) return;
  refreshHealth = { ...refreshHealth, status: 'failed', lastAttemptMs: attemptAtMs, errorStage: stage, errorCode: refreshErrorCode(error) };
  if (current) recordGpsDiagnostic(current.session.ownerId, current.session.id, { atMs: Date.now(), kind: 'refresh', refreshStatus: 'failed', refreshStage: stage, refreshErrorCode: refreshHealth.errorCode, refreshDurationMs: Math.max(0, Date.now() - attemptAtMs), snapshotAgeMs: refreshHealth.snapshotAgeMs, gpsQualityState: current.gpsQuality.state });
  if (current) { current = { ...current, refreshHealth }; emit(); }
}

function refreshSuccess(row: SavedRow, attemptAtMs: number, recoveredFromFailure = false): MetricsRefreshHealth {
  const status = recoveredFromFailure ? 'recovered' : 'current';
  const publishedAtMs = Date.now();
  return { status, lastAttemptMs: attemptAtMs, lastSuccessMs: publishedAtMs, snapshotCheckpointAtMs: row.checkpoint_at_ms, snapshotAgeMs: Math.max(0, publishedAtMs - row.checkpoint_at_ms), errorStage: null, errorCode: null };
}

/** Lifecycle writes share the same serial queue as TaskManager route batches. */
function checkpoint(snapshot: TrackerSnapshot): Promise<void> {
  const recordedAt = Date.now();
  const task = serializeGpsWrite(async () => {
    const database = await db(); const s = snapshot.session;
    await database.transaction(async () => {
      const existing = await database.getFirst<{ id: string }>('SELECT id FROM tracking_sessions WHERE id = ? AND owner_id = ?', [s.id, s.ownerId]);
      if (!existing) {
        await database.run('INSERT INTO tracking_sessions (id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [s.id, s.ownerId, s.plannedSessionId, snapshot.revisionId, s.prescriptionSnapshot, s.mode, s.status, s.startedAtMs, s.endedAtMs, recordedAt, JSON.stringify(s.segments), s.distanceMeters, s.metricVersion, snapshot.timerOnly ? 'timer_only' : 'gps']);
      } else {
        await database.run('UPDATE tracking_sessions SET state = ?, ended_at_ms = ?, checkpoint_at_ms = MAX(checkpoint_at_ms, ?), segments_json = ?, distance_meters = CASE WHEN distance_meters IS NULL THEN ? ELSE MAX(distance_meters, ?) END, status_reason = ? WHERE id = ? AND owner_id = ?', [s.status, s.endedAtMs, recordedAt, JSON.stringify(s.segments), s.distanceMeters, s.distanceMeters, snapshot.timerOnly ? 'timer_only' : 'gps', s.id, s.ownerId]);
      }
      if (snapshot.researchCheckIn && s.status === 'cancelled') await database.run('DELETE FROM research_pending_checkins WHERE owner_id = ? AND activity_id = ?', [s.ownerId, s.id]);
      else if (snapshot.researchCheckIn) await retainPendingResearchCheckin(database, s.ownerId, s.id, snapshot.researchCheckIn.blockId, snapshot.researchCheckIn.assignmentId, new Date(recordedAt).toISOString());
    });
    if (recordedAt - lastProgressCheckpoint >= 60000 && s.status === 'recording') { lastProgressCheckpoint = recordedAt; }
  });
  return task;
}

function checkpointTimeOnly(sessionId: string, ownerId: string): Promise<void> {
  const task = serializeGpsWrite(async () => { const database = await db(); await database.run("UPDATE tracking_sessions SET checkpoint_at_ms = MAX(checkpoint_at_ms, ?) WHERE id = ? AND owner_id = ? AND state = 'recording'", [Date.now(), sessionId, ownerId]); });
  return task;
}

function stopCheckpointTimer() { if (checkpointTimer !== null) clearInterval(checkpointTimer); checkpointTimer = null; }
function startCheckpointTimer() {
  stopCheckpointTimer();
  checkpointTimer = setInterval(() => {
    if (current?.session.status !== 'recording') return;
    void syncTrackerFromPersistence().then((saved) => {
      if (!saved || saved.session.status !== 'recording') return;
      const lastFix = saved.gpsQuality.lastAcceptedTimestampMs ?? saved.session.segments.at(-1)?.startedAtMs ?? Date.now();
      const weakMessage = 'GPS signal is weak or lost. Distance may be incomplete.';
      if (!saved.timerOnly && Date.now() - lastFix > 30000) { current = { ...saved, message: weakMessage }; emit(); }
      else if (saved.message === weakMessage) { current = { ...saved, message: null }; emit(); }
      if (Date.now() - lastProgressCheckpoint >= 5000) { lastProgressCheckpoint = Date.now(); void checkpointTimeOnly(saved.session.id, saved.session.ownerId).catch(() => { if (current) { current = { ...current, message: 'Could not save progress. Pause and try again.' }; emit(); } }); }
    }).catch(() => { /* syncTrackerFromPersistence publishes a sanitised refresh-health failure. */ });
  }, 5000);
}

function trackPoint(location: Location.LocationObject): TrackPoint { return { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy, timestampMs: location.timestamp }; }
function trustedAnchor(location: Location.LocationObject): TrustedPipelineAnchor { return { timestampMs: location.timestamp, latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy }; }
export function androidLocationPrecision(permission: Location.LocationPermissionResponse): 'precise' | 'approximate' | 'unknown' {
  if (permission.android?.accuracy === 'fine') return 'precise';
  if (permission.android?.accuracy === 'coarse') return 'approximate';
  return 'unknown';
}

async function stopLocationPipeline() {
  try { if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK)) await Location.stopLocationUpdatesAsync(BACKGROUND_GPS_TASK); }
  finally { await flushGpsWrites(); }
}

async function ensureLocationPipelinePermissions() {
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on location services before starting an outdoor activity.');
  const foreground = await Location.getForegroundPermissionsAsync();
  const foregroundPermission = foreground.granted ? foreground : await Location.requestForegroundPermissionsAsync();
  if (!foregroundPermission.granted) throw new Error('Location permission is required before a run can start. Enable location while using the app and try again.');
  const background = await Location.getBackgroundPermissionsAsync();
  const backgroundPermission = background.granted ? background : await Location.requestBackgroundPermissionsAsync();
  if (!backgroundPermission.granted) throw new Error('Allow location all the time to keep recording when your screen is locked. On Android 11 or newer, choose this in Location settings.');
  return androidLocationPrecision(foregroundPermission);
}

async function startLocationPipeline() {
  const precision = await ensureLocationPipelinePermissions();
  if (!await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK)) {
    await Location.startLocationUpdatesAsync(BACKGROUND_GPS_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 1000,
      distanceInterval: 1,
      pausesUpdatesAutomatically: false,
      deferredUpdatesInterval: 0,
      foregroundService: { notificationTitle: 'Torto workout in progress', notificationBody: 'Recording your run or walk location.', notificationColor: '#65735B', killServiceOnDestroy: false },
    });
  }
  return precision;
}

async function readOwnedRow(ownerId: string, sessionId?: string, database?: SqlDatabase): Promise<SavedRow | null> {
  const activeDatabase = database ?? await db();
  if (sessionId) return activeDatabase.getFirst<SavedRow>('SELECT * FROM tracking_sessions WHERE id = ? AND owner_id = ?', [sessionId, ownerId]);
  return activeDatabase.getFirst<SavedRow>("SELECT * FROM tracking_sessions WHERE owner_id = ? AND state IN ('recording','paused','finishing','interrupted') ORDER BY checkpoint_at_ms DESC LIMIT 1", [ownerId]);
}

function validateSavedTimeline(row: SavedRow): void {
  assertValidRecordingTimeline(JSON.parse(row.segments_json) as RecordingSegment[]);
}

async function snapshotFromRow(row: SavedRow, message: string | null = null, health: MetricsRefreshHealth = refreshHealth, database?: SqlDatabase): Promise<TrackerSnapshot> {
  const activeDatabase = database ?? await db(); const segments = JSON.parse(row.segments_json) as RecordingSegment[];
  assertValidRecordingTimeline(segments);
  const metricVersion = row.metric_version ?? 1;
  const session: TrainingSession = { id: row.id, ownerId: row.owner_id, plannedSessionId: row.planned_session_id, prescriptionSnapshot: row.prescription_json, mode: row.mode, status: row.state, startedAtMs: row.started_at_ms, endedAtMs: row.ended_at_ms, segments, distanceMeters: row.distance_meters, metricVersion };
  const segment = Math.max(0, segments.length - 1);
  const points = await activeDatabase.getAll<SavedPoint>('SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? AND segment = ? ORDER BY timestamp_ms DESC LIMIT 20', [row.id, segment]);
  const timerOnly = row.status_reason === 'timer_only';
  const [metricEdges, completedKmSplits, gpsRow] = metricVersion >= 2
    ? await Promise.all([loadLiveMetricEdges(activeDatabase, row.owner_id, row.id), loadKmSplits(activeDatabase, row.owner_id, row.id), loadGpsState(activeDatabase, row.owner_id, row.id)])
    : [null, null, await loadGpsState(activeDatabase, row.owner_id, row.id)] as const;
  return { session, revisionId: row.revision_id, track: restoreRouteState(points, row.distance_meters ?? 0, metricVersion), metricEdges, completedKmSplits, gpsQuality: qualityFromRow(gpsRow, timerOnly), refreshHealth: health, timerOnly, message };
}

/** Reads a specific owner-scoped historical session without changing tracker lifecycle state. */
export async function loadTrackerSnapshot(ownerId: string, sessionId: string): Promise<TrackerSnapshot | null> {
  const row = await readOwnedRow(ownerId, sessionId);
  return row ? snapshotFromRow(row) : null;
}

/** Developer export helper. It is read-only and never changes active lifecycle state. */
export async function loadLatestTrackerSnapshot(ownerId: string): Promise<TrackerSnapshot | null> {
  const database = await db();
  const row = await database.getFirst<SavedRow>('SELECT * FROM tracking_sessions WHERE owner_id = ? ORDER BY checkpoint_at_ms DESC LIMIT 1', [ownerId]);
  return row ? snapshotFromRow(row) : null;
}

export async function syncTrackerFromPersistence(): Promise<TrackerSnapshot | null> {
  const attempt = refreshSequence += 1;
  const attemptAtMs = Date.now();
  const recoveredFromFailure = refreshHealth.status === 'failed' || refreshHealth.status === 'stale' || refreshHealth.status === 'recovering';
  let stage: MetricsRefreshStage = 'account_resolution';
  let revisionAtReadStart = trackerRevision;
  let sessionIdAtReadStart = current?.session.id ?? null;
  refreshHealth = recoveredFromFailure
    ? { ...refreshHealth, status: 'recovering', lastAttemptMs: attemptAtMs }
    : { ...refreshHealth, status: 'pending', lastAttemptMs: attemptAtMs, errorStage: null, errorCode: null };
  if (current) { current = { ...current, refreshHealth }; emit(); }
  try {
    // Periodic reconciliation validates the signed-in owner without rewriting
    // active_account_id or rerunning migrations on every five-second tick.
    const ownerId = await getTrackerOwnerId({ readOnly: true });
    if (revisionAtReadStart !== trackerRevision) return current;
    if (current && current.session.ownerId !== ownerId) { trackerRevision += 1; current = null; emit(); revisionAtReadStart = trackerRevision; sessionIdAtReadStart = null; }
    stage = schemaReady ? 'database_open' : 'migration_readiness';
    const database = await db();
    stage = 'session_lookup';
    const previousMessage = current?.message === 'Saved GPS progress could not be refreshed. Keep the app open and check location permission.' ? null : current?.message ?? null;
    // The session row, route evidence, splits and quality state must describe
    // one SQLite checkpoint, not a mixture of a pre- and post-write route.
    const loadSnapshot = async (scoped: SqlDatabase) => {
      const row = await readOwnedRow(ownerId, sessionIdAtReadStart ?? undefined, scoped);
      if (!row || !['recording', 'paused', 'finishing', 'interrupted'].includes(row.state)) return null;
      if (row.status_reason !== 'timer_only') {
        const binding = await loadActiveGpsBinding(scoped);
        if (!binding || binding.owner_id !== ownerId || binding.session_id !== row.id) throw new Error('active_gps_binding_not_owned');
      }
      stage = 'evidence_read';
      stage = 'timeline_validation';
      validateSavedTimeline(row);
      stage = 'evidence_read';
      const snapshot = await snapshotFromRow(row, previousMessage, refreshHealth, scoped);
      return { row, snapshot };
    };
    const loaded = database.exclusiveTransaction
      ? await database.exclusiveTransaction(loadSnapshot)
      : await database.transaction(() => loadSnapshot(database));
    stage = 'snapshot_publication';
    if (!refreshOutcomeEligible(attempt, revisionAtReadStart, sessionIdAtReadStart)) return current;
    if (!loaded) {
      if (current?.session.ownerId === ownerId) { trackerRevision += 1; current = null; emit(); }
      return null;
    }
    const health = refreshSuccess(loaded.row, attemptAtMs, recoveredFromFailure);
    refreshHealth = health;
    current = { ...loaded.snapshot, refreshHealth: health }; emit();
    const snapshot = current;
    void recordGpsDiagnostic(snapshot.session.ownerId, snapshot.session.id, { atMs: Date.now(), kind: 'refresh', refreshStatus: health.status, refreshStage: null, refreshErrorCode: null, refreshDurationMs: Date.now() - attemptAtMs, snapshotAgeMs: health.snapshotAgeMs, gpsQualityState: snapshot.gpsQuality.state });
    return current;
  } catch (error) {
    refreshFailure(stage, error, attempt, attemptAtMs, revisionAtReadStart, sessionIdAtReadStart);
    throw error;
  }
}

async function markRecordingInterrupted(reason: string) {
  if (!current || current.session.status !== 'recording') return;
  trackerRevision += 1;
  const cutoffMs = Date.now();
  await setGpsRecordingCutoff(current.session.id, current.session.ownerId, cutoffMs);
  await stopLocationPipeline();
  const persisted = await syncTrackerFromPersistence();
  if (!persisted || persisted.session.status !== 'recording') return;
  const row = await readOwnedRow(persisted.session.ownerId, persisted.session.id);
  if (!row) return;
  current = { ...persisted, session: transitionSession(persisted.session, 'interrupt', cutoffMs), track: breakTrackSegment(persisted.track), message: reason };
  await checkpoint(current); await setGpsBindingLifecycle(current.session.id, current.session.ownerId, 'interrupted', cutoffMs); emit();
}

export function subscribeTracker(listener: (value: TrackerSnapshot | null) => void) { listeners.add(listener); listener(current); return () => { listeners.delete(listener); }; }

export async function recoverTracker(): Promise<TrackerSnapshot | null> {
  const ownerId = await getTrackerOwnerId();
  if (current?.session.ownerId === ownerId) return current;
  if (current) { trackerRevision += 1; current = null; emit(); }
  const binding = await loadGpsSessionBindingForOwner(ownerId);
  let row = binding ? await readOwnedRow(ownerId, binding.session_id) : await readOwnedRow(ownerId); if (!row) return null;
  // A committed Resume which never received native-start confirmation is not a
  // recording we can honestly recover. Stop and expose its recorded portion.
  if (row.state === 'recording') { await stopLocationPipeline(); row = await readOwnedRow(ownerId, row.id); if (!row) return null; }
  if (row.state === 'recording') {
    const segments = JSON.parse(row.segments_json) as RecordingSegment[]; const open = segments.at(-1);
    if (open && open.endedAtMs === null) open.endedAtMs = Math.max(open.startedAtMs, row.checkpoint_at_ms);
    const interrupted = await snapshotFromRow({ ...row, state: 'interrupted', segments_json: JSON.stringify(segments) }, 'Recording was interrupted. Finish the recorded portion or discard it.');
    interrupted.session = { ...interrupted.session, status: 'interrupted' }; trackerRevision += 1; current = interrupted; await checkpoint(current); if (!current.timerOnly) await setGpsBindingLifecycle(current.session.id, current.session.ownerId, 'interrupted', open?.endedAtMs ?? row.checkpoint_at_ms);
  } else { trackerRevision += 1; current = await snapshotFromRow(row, row.state === 'interrupted' ? 'Recording was interrupted. Finish the recorded portion or discard it.' : null); }
  emit(); return current;
}

export async function startTracker(input: { sessionId?: string | null; revisionId?: string | null; prescription?: string | null; mode: 'run' | 'walk'; timerOnly?: boolean; researchCheckIn?: { blockId: string; assignmentId: string } }): Promise<void> {
  if (busy) return; busy = true;
  try {
    trackerRevision += 1;
    if (await recoverTracker()) throw new Error('A workout is already in progress. Finish it before starting another.');
    const timerOnly = input.timerOnly === true;
    if (trackerOnly && timerOnly) throw new Error('GPS is required for tracker recording.');
    let fix: Location.LocationObject | null = null;
    let locationPrecision: ReturnType<typeof androidLocationPrecision> = 'unknown';
    if (!timerOnly) {
      if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on location services before starting an outdoor activity.');
      const foreground = await Location.getForegroundPermissionsAsync();
      const permission = foreground.granted ? foreground : await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission is required before a run can start. Enable it in system settings and try again.');
      locationPrecision = androidLocationPrecision(permission);
      const background = await Location.getBackgroundPermissionsAsync();
      const backgroundPermission = background.granted ? background : await Location.requestBackgroundPermissionsAsync();
      if (!backgroundPermission.granted) throw new Error('Allow location all the time to keep recording when your screen is locked. On Android 11 or newer, choose this in Location settings.');
      fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const acquired = acceptTrackPoint(emptyTrack(), trackPoint(fix), Date.now(), 2);
      if (!acquired.accepted) throw new Error('A reliable GPS fix is not available yet. Move to an open area and try again.');
    }
    const ownerId = await getTrackerOwnerId(); const now = fix?.timestamp ?? Date.now(); const session = transitionSession({ id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, ownerId, plannedSessionId: input.sessionId ?? null, prescriptionSnapshot: input.prescription ?? null, mode: input.mode, status: 'preparing', startedAtMs: null, endedAtMs: null, segments: [], distanceMeters: null, metricVersion: 3 }, 'start', now);
    refreshHealth = { status: 'current', lastAttemptMs: now, lastSuccessMs: now, snapshotCheckpointAtMs: now, snapshotAgeMs: 0, errorStage: null, errorCode: null };
    const approximateLocation = !timerOnly && locationPrecision === 'approximate';
    current = { session, revisionId: input.revisionId ?? null, track: emptyTrack(), metricEdges: [], completedKmSplits: [], gpsQuality: timerOnly ? { state: 'unavailable', reasonCodes: ['timer_only'], lastReceivedTimestampMs: null, lastAcceptedTimestampMs: null, accuracyMeters: null } : { state: 'acquiring', reasonCodes: ['awaiting_first_recorded_fix'], lastReceivedTimestampMs: null, lastAcceptedTimestampMs: null, accuracyMeters: null }, refreshHealth, timerOnly, message: timerOnly ? 'Timer only: distance is not recorded.' : approximateLocation ? 'Approximate location is enabled. Turn on Precise location in Android settings for more reliable distance and pace.' : 'GPS ready. Recording starts with the next location fix.', ...(input.researchCheckIn ? { researchCheckIn: input.researchCheckIn } : {}) };
    if (!timerOnly) recordGpsDiagnostic(session.ownerId, session.id, { atMs: Date.now(), kind: 'permission', permissionPrecision: locationPrecision, sessionStartedAtMs: session.startedAtMs ?? undefined });
    lastProgressCheckpoint = 0;
    try { await checkpoint(current); if (!timerOnly && fix) await acquireGpsSessionBinding(current.session.id, current.session.ownerId, trustedAnchor(fix), now); }
    catch (error) {
      if (current) {
        const paused = transitionSession(current.session, 'pause', Date.now());
        current = { ...current, session: transitionSession(paused, 'cancel', Date.now()), track: breakTrackSegment(current.track), message: 'Another account or workout owns GPS recording.' };
        await checkpoint(current).catch(() => undefined);
      }
      current = null; emit(); throw error;
    }
    // A readiness fix is accepted only when its own observation timestamp falls
    // inside the newly persisted segment. Older acquisition fixes are ignored.
    if (fix) await persistLocationBatch([fix]);
    if (current) { current = { ...current }; delete current.researchCheckIn; }
    if (!timerOnly) {
      try { await startLocationPipeline(); }
      catch (error) {
        current = { ...current, session: transitionSession(current.session, 'pause', Date.now()), track: breakTrackSegment(current.track), message: 'Background location could not start. The workout is paused; grant location all the time and resume.' };
        await checkpoint(current); await setGpsBindingLifecycle(current.session.id, current.session.ownerId, 'paused', current.session.segments.at(-1)?.endedAtMs ?? Date.now());
        throw error;
      }
    }
    startCheckpointTimer(); emit();
  } finally { busy = false; }
}

export async function pauseTracker(): Promise<void> {
  if (busy) return;
  if (!current || current.session.status !== 'recording') return;
  busy = true; trackerRevision += 1;
  try {
    const cutoffMs = Date.now();
    stopCheckpointTimer(); await setGpsRecordingCutoff(current.session.id, current.session.ownerId, cutoffMs); await stopLocationPipeline();
    const persisted = await syncTrackerFromPersistence(); if (!persisted || persisted.session.status !== 'recording') return;
    current = { ...persisted, session: transitionSession(persisted.session, 'pause', cutoffMs), track: breakTrackSegment(persisted.track) };
    await checkpoint(current); await setGpsBindingLifecycle(current.session.id, current.session.ownerId, 'paused', cutoffMs); emit();
  } finally { busy = false; }
}

export async function resumeTracker(): Promise<void> {
  if (busy) return;
  if (!current || current.session.status !== 'paused') return;
  busy = true; trackerRevision += 1;
  try {
    const persisted = await syncTrackerFromPersistence(); if (!persisted || persisted.session.status !== 'paused') return;
    if (persisted.timerOnly) {
      const resumedAtMs = Date.now();
      current = { ...persisted, session: transitionSession(persisted.session, 'resume', resumedAtMs), track: breakTrackSegment(persisted.track) };
      await checkpoint(current); startCheckpointTimer(); emit(); return;
    }
    if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on location services before resuming this workout.');
    // Permission checks happen before durable Resume intent so a denied
    // permission cannot consume a generation or require compensation.
    await ensureLocationPipelinePermissions();
    const anchorLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const resumedAtMs = anchorLocation.timestamp;
    const committed = await commitGpsResume(persisted.session.id, persisted.session.ownerId, resumedAtMs, trustedAnchor(anchorLocation));
    current = { ...persisted, session: { ...persisted.session, status: 'recording', segments: committed.segments }, track: breakTrackSegment(persisted.track), gpsQuality: { ...persisted.gpsQuality, state: 'acquiring', reasonCodes: ['pipeline_quarantine'] }, message: 'GPS is acquiring a fresh location.' };
    try {
      const anchorResult = await persistLocationBatch([anchorLocation]);
      if (!anchorResult.acceptedEvidence && anchorResult.rejectionReason === 'duplicate') {
        await activateGpsPipelineAnchor(persisted.session.id, persisted.session.ownerId, committed.generation, trustedAnchor(anchorLocation));
      } else if (!anchorResult.acceptedEvidence) throw new Error(`resume_anchor_rejected:${anchorResult.rejectionReason ?? 'unknown'}`);
      const resumedPrecision = await startLocationPipeline();
      recordGpsDiagnostic(persisted.session.ownerId, persisted.session.id, { atMs: Date.now(), kind: 'permission', permissionPrecision: resumedPrecision, sessionStartedAtMs: persisted.session.startedAtMs ?? undefined });
      await confirmGpsResume(persisted.session.id, persisted.session.ownerId, committed.generation, trustedAnchor(anchorLocation));
    }
    catch (error) {
      await stopLocationPipeline().catch(() => undefined);
      try {
        await compensateGpsResumeFailure(persisted.session.id, persisted.session.ownerId, committed.generation, resumedAtMs);
      } catch (compensationError) {
        // The prior Resume intent is durable. Quarantine it and force restart
        // recovery; never continue presenting it as a reliable recording.
        try { await markGpsResumeRecoveryRequired(persisted.session.id, persisted.session.ownerId, committed.generation); } catch { /* Process recovery sees native_start_pending and interrupts it. */ }
        current = { ...persisted, session: { ...persisted.session, status: 'interrupted' }, message: 'GPS resume could not be secured. Reopen Torto to recover the recorded portion.' };
        emit();
        throw compensationError;
      }
      const row = await readOwnedRow(persisted.session.ownerId, persisted.session.id);
      current = row ? await snapshotFromRow(row, error instanceof Error ? error.message : 'GPS could not resume.') : persisted;
      emit(); throw error;
    }
    startCheckpointTimer(); emit();
  } finally { busy = false; }
}

export async function finishTracker(): Promise<TrackerSnapshot> {
  if (busy) throw new Error('A workout update is already in progress. Try again in a moment.');
  if (!current) throw new Error('No workout is in progress.');
  busy = true; trackerRevision += 1;
  try {
    const finishRequestedAtMs = Date.now();
    stopCheckpointTimer();
    if (current.session.status === 'recording') await setGpsRecordingCutoff(current.session.id, current.session.ownerId, finishRequestedAtMs);
    await stopLocationPipeline();
    const persisted = await syncTrackerFromPersistence();
    if (!persisted) throw new Error('The saved workout could not be found. Reopen the tracker and recover it before finishing.');
    if (persisted.session.status !== 'finishing' && persisted.session.status !== 'saved') {
      current = { ...persisted, session: transitionSession(persisted.session, 'finish', finishRequestedAtMs) }; await checkpoint(current); if (!current.timerOnly) await setGpsBindingLifecycle(current.session.id, current.session.ownerId, 'finishing', finishRequestedAtMs);
    }
    if (current.session.status === 'finishing') current = { ...current, session: transitionSession(current.session, 'save', Date.now()) };
    await checkpoint(current); if (!current.timerOnly) await releaseGpsSessionBinding(current.session.id, current.session.ownerId); const finished = current; current = null; emit(); return finished;
  }
  finally { busy = false; }
}

export async function discardTracker(): Promise<void> {
  if (busy) return;
  if (!current) return;
  busy = true; trackerRevision += 1;
  try {
    const discardRequestedAtMs = Date.now();
    if (current.session.status === 'recording') { stopCheckpointTimer(); await setGpsRecordingCutoff(current.session.id, current.session.ownerId, discardRequestedAtMs); await stopLocationPipeline(); await syncTrackerFromPersistence(); }
    if (!current) return;
    if (current.session.status === 'recording') { current = { ...current, session: transitionSession(current.session, 'pause', discardRequestedAtMs), track: breakTrackSegment(current.track) }; await checkpoint(current); }
    current = { ...current, session: transitionSession(current.session, 'cancel', Date.now()) }; await checkpoint(current); if (!current.timerOnly) await releaseGpsSessionBinding(current.session.id, current.session.ownerId); current = null; emit();
  } finally { busy = false; }
}

/**
 * Account exit never transfers a native GPS pipeline to another owner. A live
 * recording is durably interrupted first; only then is its binding released.
 */
export async function prepareTrackerForAccountExit(ownerId: string): Promise<void> {
  if (busy) throw new Error('A workout update is already in progress. Try signing out again in a moment.');
  busy = true; trackerRevision += 1;
  try {
    const binding = await loadGpsSessionBindingForOwner(ownerId);
    let snapshot = current?.session.ownerId === ownerId ? current : null;
    if (!snapshot) {
      const row = binding ? await readOwnedRow(ownerId, binding.session_id) : await readOwnedRow(ownerId);
      snapshot = row ? await snapshotFromRow(row) : null;
    }
    if (!snapshot) {
      if (binding) { await stopLocationPipeline(); await releaseGpsSessionBinding(binding.session_id, ownerId); }
      return;
    }
    if (binding && snapshot.session.id !== binding.session_id) throw new Error('The active GPS binding does not match the recoverable workout. Retry after reopening Torto.');
    if (!['recording', 'paused', 'interrupted', 'finishing'].includes(snapshot.session.status)) return;
    if (binding) await markGpsAccountTransitionPending(binding.session_id, ownerId);
    current = snapshot;
    const cutoffMs = Date.now();
    stopCheckpointTimer();
    if (current.session.status === 'recording') {
      await setGpsRecordingCutoff(current.session.id, ownerId, cutoffMs);
      await stopLocationPipeline();
      const row = await readOwnedRow(ownerId, current.session.id);
      if (!row) throw new Error('The active workout could not be recovered before account exit.');
      const persisted = await snapshotFromRow(row);
      current = { ...persisted, session: transitionSession(persisted.session, 'interrupt', cutoffMs), track: breakTrackSegment(persisted.track), message: 'Recording was interrupted by account exit. Sign back into this account to finish or discard it.' };
      await checkpoint(current);
      await setGpsBindingLifecycle(current.session.id, ownerId, 'interrupted', cutoffMs);
    } else {
      await stopLocationPipeline();
      await checkpoint(current);
    }
    await releaseGpsSessionBinding(current.session.id, ownerId);
    current = null; emit();
  } finally { busy = false; }
}

/** The binding remains the sole durable recording owner and also carries an
 * unfinished account-exit intent across React/native process restarts. */
export async function pendingTrackerAccountTransitionOwner(): Promise<string | null> {
  return (await loadPendingGpsAccountTransition())?.owner_id ?? null;
}

// Screen lock/app switching never pauses a workout. On foreground return, the UI
// replaces its in-memory view with the account-owned persisted session and route.
export function handleTrackerAppStateChange(state: string): Promise<void> | void {
  // An AppState reconciliation must not race an explicit Pause/Resume/Finish.
  // Lifecycle transitions own the persisted status until their checkpoint lands.
  if (state === 'active' && !busy && current?.session.status === 'recording') return (async () => {
    const saved = await syncTrackerFromPersistence();
    if (!saved || saved.timerOnly || saved.session.status !== 'recording') return;
    const attempt = refreshSequence; const revision = trackerRevision; const sessionId = saved.session.id;
    let background: Location.LocationPermissionResponse;
    try { background = await Location.getBackgroundPermissionsAsync(); }
    catch (error) { refreshFailure('foreground_permission', error, attempt, Date.now(), revision, sessionId); throw error; }
    if (!background.granted) return markRecordingInterrupted('Background location permission was removed. Recording stopped when Torto detected the change; GPS coverage before detection may be incomplete.');
    try { const foreground = await Location.getForegroundPermissionsAsync(); recordGpsDiagnostic(saved.session.ownerId, sessionId, { atMs: Date.now(), kind: 'permission', permissionPrecision: androidLocationPrecision(foreground), sessionStartedAtMs: saved.session.startedAtMs ?? undefined }); }
    catch (error) { refreshFailure('foreground_permission', error, attempt, Date.now(), revision, sessionId); throw error; }
    let servicesEnabled: boolean;
    try { servicesEnabled = await Location.hasServicesEnabledAsync(); }
    catch (error) { refreshFailure('location_service', error, attempt, Date.now(), revision, sessionId); throw error; }
    if (!servicesEnabled) return markRecordingInterrupted('Location services were turned off. Recording stopped when Torto detected the change; GPS coverage before detection may be incomplete.');
    let taskStarted: boolean;
    try { taskStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK); }
    catch (error) { refreshFailure('native_task', error, attempt, Date.now(), revision, sessionId); throw error; }
    if (!taskStarted) return markRecordingInterrupted('GPS updates stopped while the app was away. Recording stopped when Torto detected the interruption; GPS coverage may be incomplete.');
  })().catch(() => { /* syncTrackerFromPersistence publishes a sanitised refresh-health failure. */ });
}
AppState.addEventListener('change', handleTrackerAppStateChange);

export async function pendingWorkout(sessionId: string) {
  const ownerId = await getTrackerOwnerId(); const database = await db();
  return database.getFirst<SavedRow>("SELECT * FROM tracking_sessions WHERE owner_id = ? AND planned_session_id = ? AND state = 'saved' AND feedback_json IS NULL ORDER BY ended_at_ms DESC LIMIT 1", [ownerId, sessionId]);
}
export async function markWorkoutFeedbackSaved(id: string) { const ownerId = await getTrackerOwnerId(); const database = await db(); await database.run('UPDATE tracking_sessions SET feedback_json = ? WHERE id = ? AND owner_id = ?', ['{"saved":true}', id, ownerId]); }
