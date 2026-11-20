import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { acceptTrackPoint, breakTrackSegment, emptyTrack, GPS_FILTER, movementAcceptanceThresholdMeters, trackPointDistanceMeters, type TrackPoint, type TrackState } from '@/domain/tracking/metrics';
import { activeMillisecondsAt, assertValidRecordingTimeline, recordingSegmentAt, type RecordingSegment, type TrackingMetricVersion } from '@/domain/tracking/session';
import { completedKmSplits, type MetricEdgeEvidence } from '@/domain/tracking/liveRunMetrics';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { acquireActiveGpsBinding, clearActiveGpsBinding, loadActiveGpsBinding, loadGpsState, loadLiveMetricEdges, saveGpsState, updateActiveGpsBinding, type ActiveGpsBindingRow, type ActiveGpsBindingState, type GpsStateRow } from '@/data/trackingMetricsRepository';
import type { SqlDatabase } from '@/data/database';
import { reconcileBackgroundGuidedCues, type BackgroundGuidedSession } from './backgroundGuidedCues';
import { recordGpsDiagnostic, type GpsDiagnosticEvent } from './gpsDiagnostics';

export const BACKGROUND_GPS_TASK = 'torto-active-workout-location-v1';
type ActiveRow = { id: string; owner_id: string; state: string; distance_meters: number | null; checkpoint_at_ms: number; segments_json: string; metric_version: TrackingMetricVersion };
type SavedPoint = { timestamp_ms: number; latitude: number; longitude: number; accuracy_meters: number; segment: number };
let writes: Promise<void> = Promise.resolve();
/** Same-runtime visibility protects a batch already yielding inside SQLite. Tokens
 * ensure a failed older transition cannot erase a newer Pause/Finish cutoff. */
type RuntimeCutoff = { cutoffMs: number; token: string; generation: number };
const runtimeCutoffs = new Map<string, RuntimeCutoff>();
let cutoffSequence = 0;

function bindingUpdate(binding: ActiveGpsBindingRow, patch: Partial<ActiveGpsBindingRow>): Parameters<typeof updateActiveGpsBinding>[2] {
  return {
    generation: binding.generation,
    lifecycle_state: binding.lifecycle_state,
    cutoff_ms: binding.cutoff_ms,
    cutoff_token: binding.cutoff_token,
    pipeline_epoch: binding.pipeline_epoch,
    pipeline_started_at_ms: binding.pipeline_started_at_ms,
    trusted_anchor_timestamp_ms: binding.trusted_anchor_timestamp_ms,
    trusted_anchor_latitude: binding.trusted_anchor_latitude,
    trusted_anchor_longitude: binding.trusted_anchor_longitude,
    trusted_anchor_accuracy_meters: binding.trusted_anchor_accuracy_meters,
    quarantine_state: binding.quarantine_state,
    resume_state: binding.resume_state,
    resume_distance_meters: binding.resume_distance_meters,
    account_transition_pending: binding.account_transition_pending,
    updated_at_ms: binding.updated_at_ms,
    ...patch,
  };
}

export function serializeGpsWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.then(operation);
  writes = result.then(() => undefined, () => undefined);
  return result;
}

export async function flushGpsWrites(): Promise<void> { await writes; }

export interface GpsBatchPersistenceResult {
  acceptedEvidence: boolean;
  rejectionReason: string | null;
}

export function restoreRouteState(points: SavedPoint[], persistedDistance: number, metricVersion: TrackingMetricVersion = 1): TrackState {
  if (!points.length) return { ...emptyTrack(), distanceMeters: persistedDistance };
  const ordered = [...points].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  let state: TrackState = { ...emptyTrack(), distanceMeters: 0 };
  let segment: number | null = null;
  for (const point of ordered) {
    if (segment !== null && point.segment !== segment) state = breakTrackSegment(state);
    segment = point.segment;
    state = acceptTrackPoint(state, { latitude: point.latitude, longitude: point.longitude, accuracyMeters: point.accuracy_meters, timestampMs: point.timestamp_ms }, point.timestamp_ms, metricVersion).state;
  }
  const lastPoint = ordered.at(-1)!;
  const recent = state.recent.map(sample => ({ ...sample, distanceMeters: sample.distanceMeters + persistedDistance - state.distanceMeters }));
  return { ...state, distanceMeters: persistedDistance, lastPoint: { latitude: lastPoint.latitude, longitude: lastPoint.longitude, accuracyMeters: lastPoint.accuracy_meters, timestampMs: lastPoint.timestamp_ms }, recent };
}

function qualityState(input: { now: number; lastAccepted: number | null; accuracy: number | null; rejectedReason: string | null; acceptedGap: boolean; taskError: string | null }): Pick<GpsStateRow, 'quality_state' | 'reason_codes_json'> {
  const reasons: string[] = [];
  if (input.taskError) reasons.push('background_task_error');
  if (input.lastAccepted === null) reasons.push('awaiting_first_fix');
  else if (input.now - input.lastAccepted > GPS_FILTER.smoothingWindowMs) reasons.push('accepted_fix_stale');
  if (input.rejectedReason) reasons.push(`rejected_${input.rejectedReason}`);
  if (input.acceptedGap) reasons.push('location_gap');
  if (input.accuracy !== null && input.accuracy > GPS_FILTER.preferredAccuracyMeters) reasons.push('accuracy_above_preferred');
  const quality_state = input.lastAccepted === null ? 'acquiring'
    : input.now - input.lastAccepted > GPS_FILTER.smoothingWindowMs ? 'stale'
      : reasons.length > 0 ? 'degraded' : 'reliable';
  return { quality_state, reason_codes_json: JSON.stringify(reasons) };
}

async function exclusive<T>(database: SqlDatabase, operation: (scoped: SqlDatabase) => Promise<T>): Promise<T> {
  return database.exclusiveTransaction ? database.exclusiveTransaction(operation) : database.transaction(() => operation(database));
}

function edgeKind(reason: 'first' | 'accepted' | 'gap'): MetricEdgeEvidence['kind'] {
  return reason === 'accepted' ? 'movement' : reason === 'gap' ? 'gap' : 'anchor';
}

async function insertDerivedSplits(database: SqlDatabase, ownerId: string, sessionId: string): Promise<void> {
  const latest = await database.getFirst<{ kilometre: number; crossing_active_ms: number }>('SELECT kilometre, crossing_active_ms FROM tracking_km_splits WHERE owner_id = ? AND session_id = ? ORDER BY kilometre DESC LIMIT 1', [ownerId, sessionId]);
  const edges = await loadLiveMetricEdges(database, ownerId, sessionId);
  for (const split of completedKmSplits(sessionId, edges, latest?.crossing_active_ms ?? 0)) {
    if (split.kilometre <= (latest?.kilometre ?? 0)) continue;
    await database.run('INSERT INTO tracking_km_splits (id, owner_id, session_id, kilometre, crossing_active_ms, duration_ms, pace_sec_per_km, gps_coverage, metric_version, split_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, kilometre) DO NOTHING', [split.id, ownerId, sessionId, split.kilometre, split.crossingActiveMs, split.durationMs, split.paceSecPerKm, split.gpsCoverage, split.metricVersion, split.splitVersion]);
  }
}

export function persistLocationBatch(locations: Location.LocationObject[], now = Date.now()): Promise<GpsBatchPersistenceResult> {
  let guidedSession: BackgroundGuidedSession | null = null;
  let diagnosticOwnerId: string | null = null;
  let diagnosticSessionId: string | null = null;
  const diagnostics: GpsDiagnosticEvent[] = [];
  let outcome: GpsBatchPersistenceResult = { acceptedEvidence: false, rejectionReason: locations.length ? 'no_active_session' : 'empty_batch' };
  return serializeGpsWrite(async () => {
    if (!locations.length) return;
    const database = await openAppDatabase();
    await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      let binding = await loadActiveGpsBinding(scoped);
      if (!binding) { outcome = { acceptedEvidence: false, rejectionReason: 'no_active_binding' }; return; }
      const row = await scoped.getFirst<ActiveRow & { prescription_json: string | null }>("SELECT id, owner_id, state, distance_meters, checkpoint_at_ms, segments_json, prescription_json, metric_version FROM tracking_sessions WHERE id = ? AND owner_id = ? AND state IN ('recording','paused','finishing','interrupted')", [binding.session_id, binding.owner_id]);
      if (!row) { outcome = { acceptedEvidence: false, rejectionReason: 'stale_active_binding' }; return; }
      diagnosticOwnerId = row.owner_id; diagnosticSessionId = row.id;
      const compatibleBindingState = binding.lifecycle_state === 'draining' || binding.lifecycle_state === row.state || (binding.lifecycle_state === 'finishing' && row.state === 'paused');
      if (!compatibleBindingState) { outcome = { acceptedEvidence: false, rejectionReason: 'binding_session_state_mismatch' }; return; }
      row.metric_version ??= 1;
      const previousCheckpoint = row.checkpoint_at_ms;
      const segments = JSON.parse(row.segments_json) as RecordingSegment[];
      const persistedPoints = await scoped.getAll<SavedPoint>(row.metric_version >= 2
        ? 'SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms DESC LIMIT 1'
        : 'SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms', [row.id]);
      let track = restoreRouteState(persistedPoints, row.distance_meters ?? 0, row.metric_version);
      let lastCommittedTimestamp = persistedPoints.at(-1)?.timestamp_ms ?? null;
      let currentSegment = persistedPoints.at(-1)?.segment ?? null;
      const initialGps: GpsStateRow = await loadGpsState(scoped, row.owner_id, row.id) ?? { session_id: row.id, owner_id: row.owner_id, last_received_timestamp_ms: null, last_accepted_timestamp_ms: null, accuracy_meters: null, quality_state: 'acquiring', reason_codes_json: '["awaiting_first_fix"]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: now };
      track = { ...track, lastValidObservationTimestampMs: initialGps.last_valid_observation_timestamp_ms ?? initialGps.last_accepted_timestamp_ms };
      let lastReceived = initialGps.last_received_timestamp_ms;
      let lastAccepted = initialGps.last_accepted_timestamp_ms;
      let accuracy = initialGps.accuracy_meters;
      let lastRejectedReason: string | null = null;
      let acceptedGap = false;
      let acceptedAny = false;

      for (const location of [...locations].sort((a, b) => a.timestamp - b.timestamp)) {
        const point: TrackPoint = { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy, timestampMs: location.timestamp };
        const previousReceived = lastReceived;
        lastReceived = Math.max(lastReceived ?? Number.NEGATIVE_INFINITY, point.timestampMs);
        const locationDiagnostics = { atMs: now, kind: 'location' as const, sessionStartedAtMs: segments[0]?.startedAtMs, observationTimestampMs: point.timestampMs, processingTimestampMs: now, deliveryIntervalMs: previousReceived === null ? null : Math.max(0, point.timestampMs - previousReceived), processingDelayMs: Math.max(0, now - point.timestampMs), accuracyMeters: point.accuracyMeters, speedMetersPerSecond: Number.isFinite(location.coords.speed ?? NaN) ? location.coords.speed : null, headingDegrees: Number.isFinite(location.coords.heading ?? NaN) ? location.coords.heading : null, hasSpeed: location.coords.speed !== null && location.coords.speed !== undefined, hasHeading: location.coords.heading !== null && location.coords.heading !== undefined, mocked: 'mocked' in location ? Boolean((location as Location.LocationObject & { mocked?: boolean }).mocked) : null };
        const rejectDiagnostic = (reason: string) => { diagnostics.push({ ...locationDiagnostics, accepted: false, rejectionReason: reason, committedDistanceIncrementMeters: 0, cumulativeDistanceMeters: track.distanceMeters }); };
        if (binding.quarantine_state === 'blocked' || binding.resume_state === 'recovery_required') { lastRejectedReason = binding.resume_state === 'recovery_required' ? 'resume_recovery_required' : 'pipeline_retirement_unresolved'; rejectDiagnostic(lastRejectedReason); continue; }
        if (binding.pipeline_started_at_ms !== null && point.timestampMs < binding.pipeline_started_at_ms) { lastRejectedReason = 'before_pipeline_epoch'; rejectDiagnostic(lastRejectedReason); continue; }
        if (binding.quarantine_state === 'pending') {
          const anchorMatches = binding.trusted_anchor_timestamp_ms === point.timestampMs
            && binding.trusted_anchor_latitude === point.latitude
            && binding.trusted_anchor_longitude === point.longitude
            && binding.trusted_anchor_accuracy_meters === point.accuracyMeters;
          if (!anchorMatches) { lastRejectedReason = 'pipeline_quarantine'; rejectDiagnostic(lastRejectedReason); continue; }
        }
        if (binding.resume_state === 'native_start_pending' && binding.quarantine_state !== 'pending') { lastRejectedReason = 'pipeline_start_unconfirmed'; rejectDiagnostic(lastRejectedReason); continue; }
        const segment = recordingSegmentAt(segments, point.timestampMs);
        const effectiveCutoff = runtimeCutoffs.get(row.id)?.cutoffMs ?? binding.cutoff_ms ?? initialGps.accept_until_ms;
        if (segment === null || (effectiveCutoff !== null && point.timestampMs > effectiveCutoff)) { lastRejectedReason = 'outside_recording_segment'; rejectDiagnostic(lastRejectedReason); continue; }
        const duplicate = await scoped.getFirst<SavedPoint>('SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? AND timestamp_ms = ?', [row.id, point.timestampMs]);
        if (duplicate) { lastRejectedReason = duplicate.latitude === point.latitude && duplicate.longitude === point.longitude ? 'duplicate' : 'duplicate_timestamp_conflict'; rejectDiagnostic(lastRejectedReason); continue; }
        if (lastCommittedTimestamp !== null && point.timestampMs <= lastCommittedTimestamp) { lastRejectedReason = 'out_of_order'; rejectDiagnostic(lastRejectedReason); continue; }
        if (currentSegment !== null && currentSegment !== segment) track = breakTrackSegment(track);
        currentSegment = segment;
        const previousAnchor = track.lastPoint;
        const rawDisplacementMeters = previousAnchor ? trackPointDistanceMeters(previousAnchor, point) : null;
        const acceptanceThresholdMeters = movementAcceptanceThresholdMeters(previousAnchor?.accuracyMeters ?? null, point.accuracyMeters, row.metric_version);
        const result = acceptTrackPoint(track, point, now, row.metric_version);
        track = result.state;
        if (!result.accepted) { lastRejectedReason = result.reason; diagnostics.push({ ...locationDiagnostics, accepted: false, rejectionReason: result.reason, rawDisplacementMeters, acceptanceThresholdMeters, committedDistanceIncrementMeters: 0, cumulativeDistanceMeters: track.distanceMeters }); continue; }
        const inserted = await scoped.run('INSERT INTO tracking_points (id, session_id, timestamp_ms, latitude, longitude, accuracy_meters, segment) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, timestamp_ms) DO NOTHING', [`${row.id}:${point.timestampMs}`, row.id, point.timestampMs, point.latitude, point.longitude, point.accuracyMeters ?? -1, segment]);
        if (inserted.changes === 0) { lastRejectedReason = 'duplicate'; rejectDiagnostic(lastRejectedReason); continue; }
        lastCommittedTimestamp = point.timestampMs;
        lastAccepted = point.timestampMs;
        accuracy = point.accuracyMeters;
        acceptedAny = true;
        acceptedGap ||= result.reason === 'gap';
        lastRejectedReason = null;
        if (row.metric_version >= 2) {
          await scoped.run('INSERT INTO tracking_metric_edges (id, owner_id, session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, observation_timestamp_ms) DO NOTHING', [`${row.id}:metric:${point.timestampMs}`, row.owner_id, row.id, point.timestampMs, now, segment, result.distanceIncrementMeters, track.distanceMeters, activeMillisecondsAt(segments, point.timestampMs), point.accuracyMeters ?? -1, edgeKind(result.reason as 'first' | 'accepted' | 'gap'), row.metric_version]);
        }
        // Initial start has no pending Resume intent and may open after its
        // trusted anchor. A Resume anchor never confirms native startup.
        if (binding.quarantine_state === 'pending' && binding.resume_state === 'confirmed') {
          binding = await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { quarantine_state: 'ready', updated_at_ms: now }));
        }
        diagnostics.push({ ...locationDiagnostics, accepted: true, rejectionReason: null, rawDisplacementMeters, acceptanceThresholdMeters, committedDistanceIncrementMeters: result.distanceIncrementMeters, cumulativeDistanceMeters: track.distanceMeters, gap: result.reason === 'gap' });
      }
      if (row.metric_version >= 2) await insertDerivedSplits(scoped, row.owner_id, row.id);
      outcome = { acceptedEvidence: acceptedAny, rejectionReason: lastRejectedReason };
      const quality = qualityState({ now, lastAccepted, accuracy, rejectedReason: lastRejectedReason, acceptedGap, taskError: acceptedAny ? null : initialGps.task_error_code });
      await saveGpsState(scoped, { ...initialGps, last_received_timestamp_ms: Number.isFinite(lastReceived) ? lastReceived : null, last_accepted_timestamp_ms: lastAccepted, last_valid_observation_timestamp_ms: track.lastValidObservationTimestampMs, accuracy_meters: accuracy, ...quality, task_error_code: acceptedAny ? null : initialGps.task_error_code, updated_at_ms: now });
      const checkpointAt = Math.max(row.checkpoint_at_ms, now);
      await scoped.run("UPDATE tracking_sessions SET distance_meters = ?, checkpoint_at_ms = ? WHERE id = ? AND owner_id = ? AND state IN ('recording','paused','finishing')", [track.distanceMeters, checkpointAt, row.id, row.owner_id]);
      if (row.state === 'recording') guidedSession = { id: row.id, owner_id: row.owner_id, state: row.state, prescription_json: row.prescription_json, segments_json: row.segments_json, checkpoint_at_ms: previousCheckpoint };
    });
  }).then(async () => {
    if (diagnosticOwnerId && diagnosticSessionId) for (const event of diagnostics) recordGpsDiagnostic(diagnosticOwnerId, diagnosticSessionId, event);
    if (guidedSession) {
      const database = await openAppDatabase();
      await reconcileBackgroundGuidedCues(database, guidedSession, now).catch(() => undefined);
    }
    return outcome;
  });
}

async function reconcileEvidenceAtCutoff(database: SqlDatabase, row: ActiveRow, ownerId: string, cutoffMs: number): Promise<void> {
  const afterCutoff = await database.getFirst<{ count: number }>('SELECT COUNT(*) AS count FROM tracking_points WHERE session_id = ? AND timestamp_ms > ?', [row.id, cutoffMs]);
  if ((afterCutoff?.count ?? 0) > 0 && row.metric_version < 2) throw new Error('gps_cutoff_reconciliation_unsupported_legacy');
  if (row.metric_version >= 2) {
    await database.run('DELETE FROM tracking_points WHERE session_id = ? AND timestamp_ms > ?', [row.id, cutoffMs]);
    await database.run('DELETE FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? AND observation_timestamp_ms > ?', [ownerId, row.id, cutoffMs]);
    await database.run('DELETE FROM tracking_km_splits WHERE owner_id = ? AND session_id = ?', [ownerId, row.id]);
    const edge = await database.getFirst<{ cumulative_distance_meters: number }>('SELECT cumulative_distance_meters FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? ORDER BY observation_timestamp_ms DESC LIMIT 1', [ownerId, row.id]);
    const point = await database.getFirst<SavedPoint>('SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms DESC LIMIT 1', [row.id]);
    const distance = edge?.cumulative_distance_meters ?? 0;
    await database.run('UPDATE tracking_sessions SET distance_meters = ?, checkpoint_at_ms = ? WHERE id = ? AND owner_id = ?', [distance, cutoffMs, row.id, ownerId]);
    const gps = await loadGpsState(database, ownerId, row.id);
    if (gps) await saveGpsState(database, { ...gps, last_accepted_timestamp_ms: point?.timestamp_ms ?? null, last_valid_observation_timestamp_ms: point?.timestamp_ms ?? null, accuracy_meters: point?.accuracy_meters ?? null, accept_until_ms: cutoffMs, updated_at_ms: Date.now() });
    await insertDerivedSplits(database, ownerId, row.id);
  } else {
    await database.run('UPDATE tracking_sessions SET checkpoint_at_ms = ? WHERE id = ? AND owner_id = ?', [cutoffMs, row.id, ownerId]);
  }
}

export function setGpsRecordingCutoff(sessionId: string, ownerId: string, cutoffMs: number): Promise<void> {
  const token = `${ownerId}:${sessionId}:${cutoffMs}:${cutoffSequence += 1}`;
  // A runtime cutoff is only published after its SQLite transaction commits.
  // A prior map entry is therefore known-durable, never another failed attempt.
  let committed: RuntimeCutoff | null = null;
  const operation = serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date().toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId) throw new Error('active_gps_binding_not_owned');
      committed = { cutoffMs, token, generation: binding.generation };
      const row = await scoped.getFirst<ActiveRow>('SELECT id, owner_id, state, distance_meters, checkpoint_at_ms, segments_json, metric_version FROM tracking_sessions WHERE id = ? AND owner_id = ?', [sessionId, ownerId]);
      if (!row || row.state !== 'recording') throw new Error('active_gps_session_not_recording');
      const current = await loadGpsState(scoped, ownerId, sessionId) ?? { session_id: sessionId, owner_id: ownerId, last_received_timestamp_ms: null, last_accepted_timestamp_ms: null, accuracy_meters: null, quality_state: 'acquiring' as const, reason_codes_json: '["awaiting_first_fix"]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: Date.now() };
      await saveGpsState(scoped, { ...current, accept_until_ms: cutoffMs, updated_at_ms: Date.now() });
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { lifecycle_state: 'draining', cutoff_ms: cutoffMs, cutoff_token: token, updated_at_ms: Date.now() }));
      await reconcileEvidenceAtCutoff(scoped, row, ownerId, cutoffMs);
    });
  });
  return operation.then(() => { if (committed) runtimeCutoffs.set(sessionId, committed); });
}

export type TrustedPipelineAnchor = { timestampMs: number; latitude: number; longitude: number; accuracyMeters: number | null };
export type CommittedGpsResume = { generation: number; segments: RecordingSegment[] };

/**
 * Confirms the explicit foreground anchor when its observation was already
 * persisted at the same timestamp. This only opens Torto's JS quarantine; it
 * is not proof that a later Expo callback belongs to a native generation.
 */
export function activateGpsPipelineAnchor(sessionId: string, ownerId: string, generation: number, anchor: TrustedPipelineAnchor, now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId || binding.generation !== generation) throw new Error('stale_pipeline_anchor');
      if (binding.quarantine_state !== 'pending'
        || binding.trusted_anchor_timestamp_ms !== anchor.timestampMs
        || binding.trusted_anchor_latitude !== anchor.latitude
        || binding.trusted_anchor_longitude !== anchor.longitude
        || binding.trusted_anchor_accuracy_meters !== anchor.accuracyMeters) throw new Error('pipeline_anchor_mismatch');
      // A duplicate trusted anchor may open an initial pipeline. Resume remains
      // pending until confirmGpsResume runs after native startup succeeds.
      if (binding.resume_state === 'confirmed') await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { quarantine_state: 'ready', updated_at_ms: now }));
    });
  });
}

export function confirmGpsResume(sessionId: string, ownerId: string, generation: number, anchor: TrustedPipelineAnchor, now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId || binding.generation !== generation) throw new Error('stale_resume_confirmation');
      if (binding.resume_state !== 'native_start_pending' || binding.quarantine_state !== 'pending') throw new Error('resume_confirmation_not_pending');
      if (binding.trusted_anchor_timestamp_ms !== anchor.timestampMs
        || binding.trusted_anchor_latitude !== anchor.latitude
        || binding.trusted_anchor_longitude !== anchor.longitude
        || binding.trusted_anchor_accuracy_meters !== anchor.accuracyMeters) throw new Error('resume_confirmation_anchor_mismatch');
      const persistedAnchor = await scoped.getFirst<SavedPoint>('SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? AND timestamp_ms = ?', [sessionId, anchor.timestampMs]);
      if (!persistedAnchor || persistedAnchor.latitude !== anchor.latitude || persistedAnchor.longitude !== anchor.longitude || persistedAnchor.accuracy_meters !== (anchor.accuracyMeters ?? -1)) throw new Error('resume_confirmation_anchor_missing');
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, {
        resume_state: 'confirmed', resume_distance_meters: null, quarantine_state: 'ready', updated_at_ms: now,
      }));
    });
  });
}

export function commitGpsResume(sessionId: string, ownerId: string, resumedAtMs: number, anchor: TrustedPipelineAnchor): Promise<CommittedGpsResume> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date().toISOString());
    return exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId) throw new Error(binding ? `active_gps_session_exists:${binding.owner_id}:${binding.session_id}` : 'active_gps_binding_missing');
      if (binding.lifecycle_state !== 'paused') throw new Error(`active_gps_binding_not_paused:${binding.lifecycle_state}`);
      const row = await scoped.getFirst<{ state: string; segments_json: string; distance_meters: number | null }>('SELECT state, segments_json, distance_meters FROM tracking_sessions WHERE id = ? AND owner_id = ?', [sessionId, ownerId]);
      if (!row || row.state !== 'paused') throw new Error('active_gps_session_not_paused');
      const segments = JSON.parse(row.segments_json) as RecordingSegment[];
      assertValidRecordingTimeline(segments);
      if (segments.at(-1)?.endedAtMs === null || resumedAtMs < (segments.at(-1)?.endedAtMs ?? 0)) throw new Error('invalid_resume_time');
      const resumedSegments = [...segments, { startedAtMs: resumedAtMs, endedAtMs: null }];
      assertValidRecordingTimeline(resumedSegments);
      const generation = binding.generation + 1;
      const updated = await scoped.run("UPDATE tracking_sessions SET state = 'recording', segments_json = ?, checkpoint_at_ms = ? WHERE id = ? AND owner_id = ? AND state = 'paused'", [JSON.stringify(resumedSegments), resumedAtMs, sessionId, ownerId]);
      if (updated.changes !== 1) throw new Error('stale_resume_session');
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { generation, lifecycle_state: 'recording', cutoff_ms: null, cutoff_token: null, pipeline_epoch: binding.pipeline_epoch + 1, pipeline_started_at_ms: resumedAtMs, trusted_anchor_timestamp_ms: anchor.timestampMs, trusted_anchor_latitude: anchor.latitude, trusted_anchor_longitude: anchor.longitude, trusted_anchor_accuracy_meters: anchor.accuracyMeters, quarantine_state: 'pending', resume_state: 'native_start_pending', resume_distance_meters: row.distance_meters, updated_at_ms: resumedAtMs }));
      const current = await loadGpsState(scoped, ownerId, sessionId) ?? { session_id: sessionId, owner_id: ownerId, last_received_timestamp_ms: null, last_accepted_timestamp_ms: null, accuracy_meters: null, quality_state: 'acquiring' as const, reason_codes_json: '[]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: Date.now() };
      await saveGpsState(scoped, { ...current, quality_state: 'acquiring', reason_codes_json: '["pipeline_quarantine"]', task_error_code: null, accept_until_ms: null, updated_at_ms: resumedAtMs });
      return { generation, segments: resumedSegments };
    });
  }).then(result => { runtimeCutoffs.delete(sessionId); return result; });
}

export function compensateGpsResumeFailure(sessionId: string, ownerId: string, generation: number, resumedAtMs: number, now = Date.now()): Promise<void> {
  let restoredCutoffMs = resumedAtMs;
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId || binding.generation !== generation) throw new Error('stale_resume_compensation');
      const row = await scoped.getFirst<ActiveRow>('SELECT id, owner_id, state, distance_meters, checkpoint_at_ms, segments_json, metric_version FROM tracking_sessions WHERE id = ? AND owner_id = ?', [sessionId, ownerId]);
      if (!row || row.state !== 'recording') throw new Error('resume_compensation_session_changed');
      const segments = JSON.parse(row.segments_json) as RecordingSegment[];
      const last = segments.at(-1);
      if (!last || last.startedAtMs !== resumedAtMs || last.endedAtMs !== null) throw new Error('resume_compensation_segment_changed');
      const failedSegment = segments.length - 1;
      const pausedSegments = segments.slice(0, -1);
      assertValidRecordingTimeline(pausedSegments);
      restoredCutoffMs = pausedSegments.at(-1)?.endedAtMs ?? resumedAtMs;
      await scoped.run('DELETE FROM tracking_points WHERE session_id = ? AND segment = ?', [sessionId, failedSegment]);
      if (row.metric_version >= 2) {
        await scoped.run('DELETE FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? AND segment = ?', [ownerId, sessionId, failedSegment]);
        await scoped.run('DELETE FROM tracking_km_splits WHERE owner_id = ? AND session_id = ?', [ownerId, sessionId]);
      }
      const edge = row.metric_version >= 2
        ? await scoped.getFirst<{ cumulative_distance_meters: number }>('SELECT cumulative_distance_meters FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? ORDER BY observation_timestamp_ms DESC LIMIT 1', [ownerId, sessionId])
        : null;
      const point = await scoped.getFirst<SavedPoint>('SELECT timestamp_ms, latitude, longitude, accuracy_meters, segment FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms DESC LIMIT 1', [sessionId]);
      // V1 route-point capture was not complete enough to reconstruct an
      // authoritative distance. Restore the durable pre-resume checkpoint.
      const reconciledDistance = row.metric_version < 2
        ? binding.resume_distance_meters
        : edge?.cumulative_distance_meters ?? row.distance_meters ?? 0;
      if (reconciledDistance === null) throw new Error('legacy_resume_checkpoint_missing');
      const updated = await scoped.run("UPDATE tracking_sessions SET state = 'paused', segments_json = ?, checkpoint_at_ms = ?, distance_meters = ? WHERE id = ? AND owner_id = ? AND state = 'recording'", [JSON.stringify(pausedSegments), now, reconciledDistance, sessionId, ownerId]);
      if (updated.changes !== 1) throw new Error('stale_resume_compensation');
      if (row.metric_version >= 2) await insertDerivedSplits(scoped, ownerId, sessionId);
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { lifecycle_state: 'paused', cutoff_ms: restoredCutoffMs, cutoff_token: null, quarantine_state: 'blocked', resume_state: 'confirmed', resume_distance_meters: null, updated_at_ms: now }));
      const current = await loadGpsState(scoped, ownerId, sessionId);
      if (current) await saveGpsState(scoped, { ...current, last_accepted_timestamp_ms: point?.timestamp_ms ?? null, last_valid_observation_timestamp_ms: point?.timestamp_ms ?? null, accuracy_meters: point?.accuracy_meters ?? null, quality_state: 'unavailable', reason_codes_json: '["resume_location_failed"]', task_error_code: 'resume_location_failed', task_error_count: Math.min(999, current.task_error_count + 1), accept_until_ms: restoredCutoffMs, updated_at_ms: now });
    });
  }).then(() => { runtimeCutoffs.set(sessionId, { cutoffMs: restoredCutoffMs, token: `resume-compensated:${ownerId}:${sessionId}:${generation}`, generation }); });
}

/**
 * Compensation itself may be unable to write. Keep the committed Resume intent
 * quarantined and durable when possible; recovery then interrupts it instead of
 * treating it as a healthy recording. This deliberately never rewinds a newer
 * generation.
 */
export function markGpsResumeRecoveryRequired(sessionId: string, ownerId: string, generation: number, now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId || binding.generation !== generation) throw new Error('stale_resume_recovery_mark');
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, {
        quarantine_state: 'blocked', resume_state: 'recovery_required', updated_at_ms: now,
      }));
      const current = await loadGpsState(scoped, ownerId, sessionId);
      if (current) await saveGpsState(scoped, { ...current, quality_state: 'unavailable', reason_codes_json: '["resume_recovery_required"]', task_error_code: 'resume_compensation_failed', task_error_count: Math.min(999, current.task_error_count + 1), updated_at_ms: now });
    });
  });
}

export function acquireGpsSessionBinding(sessionId: string, ownerId: string, anchor: TrustedPipelineAnchor, now = Date.now()): Promise<number> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    return exclusive(database, async scoped => {
      const existing = await loadActiveGpsBinding(scoped);
      if (existing) {
        const session = await scoped.getFirst<{ state: string }>('SELECT state FROM tracking_sessions WHERE id = ? AND owner_id = ?', [existing.session_id, existing.owner_id]);
        if (!session || ['saved', 'cancelled', 'error'].includes(session.state)) await clearActiveGpsBinding(scoped, existing);
      }
      await acquireActiveGpsBinding(scoped, { owner_id: ownerId, session_id: sessionId, generation: 1, lifecycle_state: 'recording', cutoff_ms: null, cutoff_token: null, pipeline_epoch: 1, pipeline_started_at_ms: now, trusted_anchor_timestamp_ms: anchor.timestampMs, trusted_anchor_latitude: anchor.latitude, trusted_anchor_longitude: anchor.longitude, trusted_anchor_accuracy_meters: anchor.accuracyMeters, quarantine_state: 'pending', updated_at_ms: now });
      return 1;
    });
  });
}

export function setGpsBindingLifecycle(sessionId: string, ownerId: string, lifecycleState: ActiveGpsBindingState, cutoffMs: number | null, now = Date.now()): Promise<number> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    return exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding) {
        await acquireActiveGpsBinding(scoped, { owner_id: ownerId, session_id: sessionId, generation: 1, lifecycle_state: lifecycleState, cutoff_ms: cutoffMs, updated_at_ms: now });
        return 1;
      }
      if (binding.owner_id !== ownerId || binding.session_id !== sessionId) throw new Error('active_gps_binding_not_owned');
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { lifecycle_state: lifecycleState, cutoff_ms: cutoffMs, updated_at_ms: now }));
      return binding.generation;
    });
  });
}

export function releaseGpsSessionBinding(sessionId: string, ownerId: string): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date().toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding) return;
      if (binding.owner_id !== ownerId || binding.session_id !== sessionId) throw new Error('active_gps_binding_not_owned');
      await clearActiveGpsBinding(scoped, binding);
    });
  }).then(() => { runtimeCutoffs.delete(sessionId); });
}

export function loadGpsSessionBindingForOwner(ownerId: string): Promise<ActiveGpsBindingRow | null> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date().toISOString());
    const binding = await loadActiveGpsBinding(database);
    return binding?.owner_id === ownerId ? binding : null;
  });
}

export function loadPendingGpsAccountTransition(): Promise<ActiveGpsBindingRow | null> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date().toISOString());
    const binding = await loadActiveGpsBinding(database);
    return binding?.account_transition_pending === 1 ? binding : null;
  });
}

export function markGpsAccountTransitionPending(sessionId: string, ownerId: string, now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding || binding.owner_id !== ownerId || binding.session_id !== sessionId) throw new Error('active_gps_binding_not_owned');
      await updateActiveGpsBinding(scoped, binding, bindingUpdate(binding, { account_transition_pending: 1, updated_at_ms: now }));
    });
  });
}

export function persistBackgroundTaskError(errorCode = 'task_manager_error', now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const binding = await loadActiveGpsBinding(scoped);
      if (!binding) return;
      const row = await scoped.getFirst<ActiveRow>("SELECT id, owner_id, state, distance_meters, checkpoint_at_ms, segments_json, metric_version FROM tracking_sessions WHERE id = ? AND owner_id = ? AND state = 'recording'", [binding.session_id, binding.owner_id]);
      if (!row) return;
      const current = await loadGpsState(scoped, row.owner_id, row.id) ?? { session_id: row.id, owner_id: row.owner_id, last_received_timestamp_ms: null, last_accepted_timestamp_ms: null, accuracy_meters: null, quality_state: 'acquiring' as const, reason_codes_json: '[]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: now };
      const reasons = new Set<string>(); try { for (const reason of JSON.parse(current.reason_codes_json) as string[]) reasons.add(reason); } catch { /* Replace malformed diagnostics. */ }
      reasons.add('background_task_error');
      await saveGpsState(scoped, { ...current, quality_state: current.last_accepted_timestamp_ms === null ? 'unavailable' : 'degraded', reason_codes_json: JSON.stringify([...reasons]), task_error_code: errorCode, task_error_count: Math.min(999, current.task_error_count + 1), updated_at_ms: now });
    });
  });
}

/** Persist a lifecycle failure for one owned session, including while it is paused. */
export function persistGpsSessionError(sessionId: string, ownerId: string, errorCode: string, now = Date.now()): Promise<void> {
  return serializeGpsWrite(async () => {
    const database = await openAppDatabase(); await migrate(database, new Date(now).toISOString());
    await exclusive(database, async scoped => {
      const current = await loadGpsState(scoped, ownerId, sessionId) ?? { session_id: sessionId, owner_id: ownerId, last_received_timestamp_ms: null, last_accepted_timestamp_ms: null, last_valid_observation_timestamp_ms: null, accuracy_meters: null, quality_state: 'unavailable' as const, reason_codes_json: '[]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: now };
      const reasons = new Set<string>();
      try { for (const reason of JSON.parse(current.reason_codes_json) as string[]) reasons.add(reason); } catch { /* Replace malformed diagnostics. */ }
      reasons.add(errorCode);
      await saveGpsState(scoped, { ...current, quality_state: 'unavailable', reason_codes_json: JSON.stringify([...reasons]), task_error_code: errorCode, task_error_count: Math.min(999, current.task_error_count + 1), updated_at_ms: now });
    });
  });
}

if (!TaskManager.isTaskDefined(BACKGROUND_GPS_TASK)) {
  TaskManager.defineTask(BACKGROUND_GPS_TASK, async ({ data, error }) => {
    if (error) { await persistBackgroundTaskError(); return; }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    await persistLocationBatch(locations).catch(() => persistBackgroundTaskError('batch_persistence_failed'));
  });
}
