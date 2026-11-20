import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';

// These fixed labels deliberately exclude coordinates, account details and health answers.
export const checkpointLabels = {
  permission_requested: 'GPS permission requested', permission_denied: 'GPS permission denied', services_disabled: 'Location services are off', permission_granted: 'GPS permission granted', gps_acquiring: 'Waiting for a usable GPS fix',
  recording_started: 'Workout started', timer_started: 'Timer-only workout started', gps_ready: 'GPS signal received', gps_weak: 'GPS signal is weak or unavailable', gps_error: 'GPS updates stopped',
  gps_approximate_permission: 'Android approximate location is enabled',
  distance_started: 'Accepted GPS movement started adding distance', pace_available: 'Current pace became available', gps_gap: 'GPS gap started a new route segment', gps_accuracy_rejected: 'A GPS sample was rejected for poor accuracy', gps_stale_rejected: 'A stale or out-of-order GPS sample was rejected', gps_jitter_filtered: 'Stationary GPS jitter was filtered', gps_jump_rejected: 'An implausible GPS jump was rejected',
  progress_saved: 'Workout progress saved', progress_failed: 'Could not save workout progress', paused: 'Workout paused', background_paused: 'App left the screen; workout paused', resumed: 'Workout resumed',
  recovered: 'Interrupted workout recovered', recording_saved: 'Workout recording saved', recording_failed: 'Could not finish saving workout', discarded: 'Workout discarded',
  feedback_opened: 'Feedback screen opened', feedback_saved: 'Feedback and History saved', feedback_failed: 'Feedback or History could not be saved', reminder_failed: 'Workout saved; reminders need retry',
} as const;
export type CheckpointCode = keyof typeof checkpointLabels;
export type WorkoutCheckpoint = { code: CheckpointCode; time: string };
// Version 2 deliberately starts a tracker-only log. The legacy planner/workout
// diagnostic key is left untouched so old records are preserved but not mixed in.
const settingKey = 'tracker_diagnostics_v2';
let entries: WorkoutCheckpoint[] = [];
let loaded = false;
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<(events: WorkoutCheckpoint[]) => void>();
const notify = () => listeners.forEach((listener) => listener([...entries]));
async function database() { const db = await openAppDatabase(); await migrate(db, new Date().toISOString()); return db; }
export async function loadWorkoutCheckpoints(): Promise<WorkoutCheckpoint[]> {
  await queue;
  if (!loaded) {
    const db = await database(); const row = await db.getFirst<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [settingKey]);
    if (row) { try { const value: unknown = JSON.parse(row.value); if (Array.isArray(value)) entries = value.filter((item): item is WorkoutCheckpoint => !!item && typeof item === 'object' && typeof item.time === 'string' && typeof item.code === 'string' && Object.prototype.hasOwnProperty.call(checkpointLabels, item.code)).slice(-40); } catch { entries = []; } }
    loaded = true;
  }
  return [...entries];
}
export function addWorkoutCheckpoint(code: CheckpointCode): void {
  const time = new Date().toISOString();
  const task = queue.then(async () => {
    if (!loaded) { const db = await database(); const row = await db.getFirst<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [settingKey]); if (row) { try { const value: unknown = JSON.parse(row.value); if (Array.isArray(value)) entries = value.filter((item): item is WorkoutCheckpoint => !!item && typeof item === 'object' && typeof item.time === 'string' && typeof item.code === 'string' && Object.prototype.hasOwnProperty.call(checkpointLabels, item.code)).slice(-40); } catch { entries = []; } } loaded = true; }
    entries = [...entries, { code, time }].slice(-40); notify();
    const db = await database(); await db.run('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)', [settingKey, JSON.stringify(entries)]);
  });
  queue = task.catch(() => { /* Recording never depends on diagnostic storage. */ });
}
export function subscribeWorkoutCheckpoints(listener: (events: WorkoutCheckpoint[]) => void) { listeners.add(listener); listener([...entries]); return () => { listeners.delete(listener); }; }
export async function clearWorkoutCheckpoints(): Promise<void> { await queue; const db = await database(); await db.run('DELETE FROM app_settings WHERE key = ?', [settingKey]); entries = []; loaded = true; notify(); }
