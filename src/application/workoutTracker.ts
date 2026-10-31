import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { acceptTrackPoint, breakTrackSegment, emptyTrack, livePaceSecondsPerKm, type PointResult, type TrackState } from '@/domain/tracking/metrics';
import { transitionSession, type RecordingSegment, type TrainingSession } from '@/domain/tracking/session';
import { addWorkoutCheckpoint } from '@/application/workoutDiagnostics';
import { getTrackerOwnerId } from './trackerIdentity';
import { trackerOnly } from '@/config/productMode';

type SavedRow = { id: string; owner_id: string; planned_session_id: string | null; revision_id: string | null; prescription_json: string | null; mode: 'run' | 'walk'; state: TrainingSession['status']; started_at_ms: number; ended_at_ms: number | null; checkpoint_at_ms: number; segments_json: string; distance_meters: number | null; status_reason: string | null };
export type TrackerSnapshot = { session: TrainingSession; revisionId: string | null; track: TrackState; timerOnly: boolean; message: string | null };
let current: TrackerSnapshot | null = null;
let watcher: Location.LocationSubscription | null = null;
let queue: Promise<void> = Promise.resolve();
let busy = false;
let gpsSignal: 'unknown' | 'weak' | 'ready' = 'unknown';
let lastProgressCheckpoint = 0;
let checkpointTimer: ReturnType<typeof setInterval> | null = null;
let pointDiagnostics = new Set<string>();
const listeners = new Set<(value: TrackerSnapshot | null) => void>();
const emit = () => listeners.forEach((listener) => listener(current));
const db = async () => { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return database; };
function checkpoint(snapshot: TrackerSnapshot): Promise<void> {
  const recordedAt = Date.now();
  const task = queue.then(async () => {
    const database = await db(); const s = snapshot.session;
    await database.run(`INSERT INTO tracking_sessions (id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, ended_at_ms=excluded.ended_at_ms, checkpoint_at_ms=excluded.checkpoint_at_ms, segments_json=excluded.segments_json, distance_meters=excluded.distance_meters, status_reason=excluded.status_reason`, [s.id, s.ownerId, s.plannedSessionId, snapshot.revisionId, s.prescriptionSnapshot, s.mode, s.status, s.startedAtMs, s.endedAtMs, recordedAt, JSON.stringify(s.segments), s.distanceMeters, s.metricVersion, snapshot.timerOnly ? 'timer_only' : 'gps']);
    if (recordedAt - lastProgressCheckpoint >= 60000 && s.status === 'recording') { lastProgressCheckpoint = recordedAt; addWorkoutCheckpoint('progress_saved'); }
  });
  queue = task.catch(() => { addWorkoutCheckpoint('progress_failed'); }); return task;
}
function stopWatcher() { watcher?.remove(); watcher = null; }
function stopCheckpointTimer() { if (checkpointTimer !== null) clearInterval(checkpointTimer); checkpointTimer = null; }
function startCheckpointTimer() { stopCheckpointTimer(); checkpointTimer = setInterval(() => { if (current?.session.status === 'recording') { const lastFix = current.track.lastPoint?.timestampMs ?? current.session.segments.at(-1)?.startedAtMs ?? Date.now(); if (!current.timerOnly && Date.now() - lastFix > 30000 && gpsSignal !== 'weak') { gpsSignal = 'weak'; addWorkoutCheckpoint('gps_weak'); current = { ...current, message: 'GPS signal is weak or lost. Distance may be incomplete.' }; emit(); } void checkpoint(current).catch(() => { if (current) { current = { ...current, message: 'Could not save progress. Pause and try again.' }; emit(); } }); } }, 5000); }
async function beginWatching() {
  const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 1 }, (location) => {
    if (!current || current.session.status !== 'recording' || current.timerOnly) return;
    const result = acceptTrackPoint(current.track, { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracyMeters: location.coords.accuracy, timestampMs: location.timestamp }, Date.now());
    recordPointDiagnostic(result, current.track.distanceMeters);
    if (result.accepted && gpsSignal !== 'ready') { gpsSignal = 'ready'; addWorkoutCheckpoint('gps_ready'); }
    if (result.reason === 'accuracy' && gpsSignal !== 'weak') { gpsSignal = 'weak'; addWorkoutCheckpoint('gps_weak'); }
    current = { ...current, track: result.state, session: { ...current.session, distanceMeters: result.state.distanceMeters > 0 ? result.state.distanceMeters : current.session.distanceMeters }, message: result.reason === 'accuracy' ? 'Waiting for a reliable GPS signal.' : result.accepted ? null : current.message };
    if (livePaceSecondsPerKm(result.state) !== null && !pointDiagnostics.has('pace_available')) { pointDiagnostics.add('pace_available'); addWorkoutCheckpoint('pace_available'); }
    emit();
  }, () => { addWorkoutCheckpoint('gps_error'); if (current) { current = { ...current, message: 'GPS is unavailable. Your recorded time is still available.' }; emit(); } });
  if (current?.session.status === 'recording') watcher = subscription; else subscription.remove();
}
function recordPointDiagnostic(result: PointResult, previousDistance: number) {
  const code = result.state.distanceMeters > previousDistance && previousDistance === 0 ? 'distance_started'
    : result.reason === 'gap' ? 'gps_gap'
    : result.reason === 'accuracy' ? 'gps_accuracy_rejected'
    : result.reason === 'stale' ? 'gps_stale_rejected'
    : result.reason === 'jitter' ? 'gps_jitter_filtered'
    : result.reason === 'jump' ? 'gps_jump_rejected'
    : null;
  if (code && !pointDiagnostics.has(code)) { pointDiagnostics.add(code); addWorkoutCheckpoint(code); }
}
export function subscribeTracker(listener: (value: TrackerSnapshot | null) => void) { listeners.add(listener); listener(current); return () => { listeners.delete(listener); }; }
export async function recoverTracker(): Promise<TrackerSnapshot | null> {
  const ownerId = await getTrackerOwnerId();
  if (current?.session.ownerId === ownerId) return current;
  if (current) return null;
  const database = await db(); const row = await database.getFirst<SavedRow>("SELECT * FROM tracking_sessions WHERE owner_id = ? AND state IN ('recording','paused','finishing','interrupted') ORDER BY checkpoint_at_ms DESC LIMIT 1", [ownerId]);
  if (!row) return null;
  const segments = JSON.parse(row.segments_json) as RecordingSegment[];
  const open = segments.at(-1); if (open && open.endedAtMs === null) open.endedAtMs = Math.max(open.startedAtMs, row.checkpoint_at_ms);
  const session: TrainingSession = { id: row.id, ownerId: row.owner_id, plannedSessionId: row.planned_session_id, prescriptionSnapshot: row.prescription_json, mode: row.mode, status: 'interrupted', startedAtMs: row.started_at_ms, endedAtMs: row.ended_at_ms, segments, distanceMeters: row.distance_meters, metricVersion: 1 };
  current = { session, revisionId: row.revision_id, track: { ...emptyTrack(), distanceMeters: row.distance_meters ?? 0 }, timerOnly: row.status_reason === 'timer_only', message: 'Recording was interrupted. Finish the recorded portion or discard it.' };
  await checkpoint(current); addWorkoutCheckpoint('recovered'); emit(); return current;
}
export async function startTracker(input: { sessionId?: string | null; revisionId?: string | null; prescription?: string | null; mode: 'run' | 'walk'; timerOnly?: boolean }): Promise<void> {
  if (busy) return; busy = true;
  try {
    if (await recoverTracker()) throw new Error('A workout is already in progress. Finish it before starting another.');
    const timerOnly = input.timerOnly === true;
    if (trackerOnly && timerOnly) throw new Error('GPS is required for tracker recording.');
    let acquiredTrack = emptyTrack();
    if (!timerOnly) {
      if (!await Location.hasServicesEnabledAsync()) { addWorkoutCheckpoint('services_disabled'); throw new Error('Turn on location services before starting an outdoor activity.'); }
      addWorkoutCheckpoint('permission_requested');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { addWorkoutCheckpoint('permission_denied'); throw new Error('Location permission is required before a run can start. Enable it in system settings and try again.'); }
      addWorkoutCheckpoint('permission_granted');
      addWorkoutCheckpoint('gps_acquiring');
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const acquired = acceptTrackPoint(acquiredTrack, { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracyMeters: fix.coords.accuracy, timestampMs: fix.timestamp }, Date.now());
      if (!acquired.accepted) { addWorkoutCheckpoint('gps_weak'); throw new Error('A reliable GPS fix is not available yet. Move to an open area and try again.'); }
      acquiredTrack = acquired.state;
      addWorkoutCheckpoint('gps_ready');
    }
    const ownerId = await getTrackerOwnerId(); const now = Date.now(); const session = transitionSession({ id: `track-${now}-${Math.random().toString(36).slice(2, 9)}`, ownerId, plannedSessionId: input.sessionId ?? null, prescriptionSnapshot: input.prescription ?? null, mode: input.mode, status: 'preparing', startedAtMs: null, endedAtMs: null, segments: [], distanceMeters: null, metricVersion: 1 }, 'start', now);
    current = { session, revisionId: input.revisionId ?? null, track: acquiredTrack, timerOnly, message: timerOnly ? 'Timer only: distance is not recorded.' : 'GPS ready.' };
    gpsSignal = timerOnly ? 'unknown' : 'ready'; pointDiagnostics = new Set(); lastProgressCheckpoint = 0; await checkpoint(current); startCheckpointTimer(); addWorkoutCheckpoint(timerOnly ? 'timer_started' : 'recording_started'); emit();
    if (!timerOnly) { try { await beginWatching(); } catch { await pauseTracker(); throw new Error('GPS could not start. Your workout is paused; resume or finish it.'); } }
  } finally { busy = false; }
}
export async function pauseTracker(): Promise<void> { if (!current || current.session.status !== 'recording') return; stopWatcher(); stopCheckpointTimer(); current = { ...current, session: transitionSession(current.session, 'pause', Date.now()), track: breakTrackSegment(current.track) }; await checkpoint(current); addWorkoutCheckpoint('paused'); emit(); }
export async function resumeTracker(): Promise<void> { if (!current || current.session.status !== 'paused') return; current = { ...current, session: transitionSession(current.session, 'resume', Date.now()), track: breakTrackSegment(current.track) }; await checkpoint(current); startCheckpointTimer(); addWorkoutCheckpoint('resumed'); emit(); if (!current.timerOnly) { try { await beginWatching(); } catch { await pauseTracker(); throw new Error('GPS could not resume. The workout is paused.'); } } }
export async function finishTracker(): Promise<TrackerSnapshot> { if (!current) throw new Error('No workout is in progress.'); try { stopWatcher(); stopCheckpointTimer(); if (current.session.status !== 'finishing' && current.session.status !== 'saved') { current = { ...current, session: transitionSession(current.session, 'finish', Date.now()) }; await checkpoint(current); } if (current.session.status === 'finishing') current = { ...current, session: transitionSession(current.session, 'save', Date.now()) }; await checkpoint(current); const finished = current; current = null; addWorkoutCheckpoint('recording_saved'); emit(); return finished; } catch (error) { addWorkoutCheckpoint('recording_failed'); throw error; } }
export async function discardTracker(): Promise<void> { if (!current) return; if (current.session.status === 'recording') await pauseTracker(); if (!current) return; current = { ...current, session: transitionSession(current.session, 'cancel', Date.now()) }; await checkpoint(current); current = null; addWorkoutCheckpoint('discarded'); emit(); }
AppState.addEventListener('change', (state) => { if (state !== 'active' && current?.session.status === 'recording') { addWorkoutCheckpoint('background_paused'); void pauseTracker().catch(() => undefined); } });

export async function pendingWorkout(sessionId: string) {
  const ownerId = await getTrackerOwnerId(); const database = await db();
  return database.getFirst<SavedRow>("SELECT * FROM tracking_sessions WHERE owner_id = ? AND planned_session_id = ? AND state = 'saved' AND feedback_json IS NULL ORDER BY ended_at_ms DESC LIMIT 1", [ownerId, sessionId]);
}
export async function markWorkoutFeedbackSaved(id: string) { const ownerId = await getTrackerOwnerId(); const database = await db(); await database.run('UPDATE tracking_sessions SET feedback_json = ? WHERE id = ? AND owner_id = ?', ['{"saved":true}', id, ownerId]); }
