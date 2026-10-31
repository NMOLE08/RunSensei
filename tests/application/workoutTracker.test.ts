import type { LocationObject } from 'expo-location';
import { discardTracker, finishTracker, markWorkoutFeedbackSaved, pauseTracker, pendingWorkout, recoverTracker, resumeTracker, startTracker, subscribeTracker } from '@/application/workoutTracker';

const mockRows = new Map<string, Record<string, unknown>>();
const mockDatabase = {
  run: jest.fn(async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT INTO tracking_sessions')) {
      const [id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason] = args;
      mockRows.set(String(id), { id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason, feedback_json: null });
    }
    if (sql.startsWith('UPDATE tracking_sessions SET feedback_json')) { const row = mockRows.get(String(args[1])); if (row && row.owner_id === args[2]) row.feedback_json = args[0]; }
    return { changes: 1 };
  }),
  getFirst: jest.fn(async (sql: string, args: unknown[] = []) => {
    const rows = [...mockRows.values()];
    if (sql.includes("state IN ('recording'")) return rows.find((row) => row.owner_id === args[0] && ['recording', 'paused', 'finishing', 'interrupted'].includes(String(row.state))) ?? null;
    if (sql.includes("state = 'saved'")) return rows.find((row) => row.owner_id === args[0] && row.planned_session_id === args[1] && row.state === 'saved' && row.feedback_json === null) ?? null;
    return null;
  }),
};
let mockLocationCallback: ((location: LocationObject) => void) | undefined;
const mockRemove = jest.fn();
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: async () => mockDatabase }));
jest.mock('@/data/migrations', () => ({ migrate: async () => undefined }));
jest.mock('@/application/workoutDiagnostics', () => ({ addWorkoutCheckpoint: jest.fn() }));
jest.mock('@/application/trackerIdentity', () => ({ getTrackerOwnerId: async () => 'account-test' }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, hasServicesEnabledAsync: jest.fn(async () => true), requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })), getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 3 }, timestamp: Date.now() })), watchPositionAsync: jest.fn(async (_options: unknown, callback: (location: LocationObject) => void) => { mockLocationCallback = callback; return { remove: mockRemove }; }) }));

it('does not start the active clock before GPS acquisition completes', async () => {
  const location = jest.requireMock('expo-location') as { getCurrentPositionAsync: jest.Mock };
  let resolveFix: ((value: LocationObject) => void) | undefined;
  location.getCurrentPositionAsync.mockImplementationOnce(() => new Promise<LocationObject>((resolve) => { resolveFix = resolve; }));
  let last: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { last = snapshot; });
  const starting = startTracker({ mode: 'run' });
  for (let attempt = 0; attempt < 20 && !resolveFix; attempt += 1) await Promise.resolve();
  expect(last).toBeNull();
  expect(resolveFix).toBeDefined();
  resolveFix?.({ coords: { latitude: 0, longitude: 0, accuracy: 3 }, timestamp: Date.now() } as LocationObject);
  await starting;
  expect(last?.session.status).toBe('recording');
  await discardTracker(); unsubscribe();
});

it('saves a standalone guest run without a plan or scheduled workout', async () => {
  await startTracker({ mode: 'run' });
  const saved = await finishTracker();
  expect(saved.session.ownerId).toBe('account-test');
  expect(saved.session.plannedSessionId).toBeNull();
  expect(saved.revisionId).toBeNull();
  expect(mockRows.get(saved.session.id)).toMatchObject({ owner_id: 'account-test', planned_session_id: null, revision_id: null, state: 'saved' });
});

it('persists a GPS workout, preserves a pause, and retains it until feedback is saved', async () => {
  mockRemove.mockClear();
  jest.useFakeTimers(); jest.setSystemTime(1000000);
  let last: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { last = snapshot; });
  await startTracker({ sessionId: 'session-1', revisionId: 'revision-1', prescription: '{"planned":true}', mode: 'walk', timerOnly: false });
  const location = (latitude: number, timestamp: number) => ({ coords: { latitude, longitude: 0, accuracy: 3 }, timestamp } as LocationObject);
  mockLocationCallback?.(location(0, 1000000));
  jest.setSystemTime(1010000); mockLocationCallback?.(location(0.0001, 1010000));
  await pauseTracker(); jest.setSystemTime(1020000); await resumeTracker();
  mockLocationCallback?.(location(0.001, 1020000));
  expect(last?.session.distanceMeters).toBeGreaterThan(10);
  expect(last?.session.distanceMeters).toBeLessThan(12);
  jest.setSystemTime(1025000); const result = await finishTracker();
  expect(result.session.segments).toEqual([{ startedAtMs: 1000000, endedAtMs: 1010000 }, { startedAtMs: 1020000, endedAtMs: 1025000 }]);
  expect(result.session.status).toBe('saved');
  expect((await pendingWorkout('session-1'))?.id).toBe(result.session.id);
  await markWorkoutFeedbackSaved(result.session.id);
  expect(await pendingWorkout('session-1')).toBeNull();
  expect(mockRemove).toHaveBeenCalledTimes(2);
  unsubscribe(); jest.useRealTimers();
});

it('requires GPS in tracker mode and does not start a timer-only recording', async () => {
  await expect(startTracker({ mode: 'run', timerOnly: true })).rejects.toThrow('GPS is required');
  expect(await recoverTracker()).toBeNull();
});

it('recovers only the recorded portion after an interruption', async () => {
  mockRows.set('interrupted', { id: 'interrupted', owner_id: 'account-test', planned_session_id: 'session-3', revision_id: 'revision-1', prescription_json: '{}', mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 8000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: null }]), distance_meters: 42, status_reason: 'gps', feedback_json: null });
  const recovered = await recoverTracker();
  expect(recovered?.session.status).toBe('interrupted');
  expect(recovered?.session.segments).toEqual([{ startedAtMs: 1000, endedAtMs: 8000 }]);
  const saved = await finishTracker();
  expect(saved.session.distanceMeters).toBe(42);
  expect((await pendingWorkout('session-3'))?.distance_meters).toBe(42);
});

it('allows retrying a failed finish without discarding the recording', async () => {
  await startTracker({ sessionId: 'session-4', revisionId: 'revision-1', prescription: '{}', mode: 'run', timerOnly: false });
  mockDatabase.run.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(finishTracker()).rejects.toThrow('Storage unavailable');
  const saved = await finishTracker();
  expect(saved.session.status).toBe('saved');
  expect((await pendingWorkout('session-4'))?.id).toBe(saved.session.id);
});
