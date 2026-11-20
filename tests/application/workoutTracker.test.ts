import type { LocationObject } from 'expo-location';
import { androidLocationPrecision, discardTracker, finishTracker, handleTrackerAppStateChange, markWorkoutFeedbackSaved, pauseTracker, pendingWorkout, prepareTrackerForAccountExit, recoverTracker, resumeTracker, startTracker, subscribeTracker, syncTrackerFromPersistence } from '@/application/workoutTracker';
import { compensateGpsResumeFailure, persistBackgroundTaskError, persistLocationBatch, setGpsRecordingCutoff } from '@/application/backgroundGpsTask';
import { activeSeconds } from '@/domain/tracking/session';
import { trackerControlState } from '@/domain/tracking/controls';

afterEach(async () => {
  await discardTracker().catch(() => undefined);
  mockRows.clear(); mockPointRows.length = 0; mockMetricEdges.length = 0; mockSplits.length = 0; mockGpsStates.clear(); mockActiveBinding = null; mockUpdatesStarted = false;
  jest.useRealTimers();
});

const mockRows = new Map<string, Record<string, unknown>>();
const mockPointRows: Record<string, unknown>[] = [];
const mockMetricEdges: Record<string, unknown>[] = [];
const mockSplits: Record<string, unknown>[] = [];
const mockGpsStates = new Map<string, Record<string, unknown>>();
let mockActiveBinding: Record<string, unknown> | null = null;
const mockDatabase = {
  transaction: jest.fn(async (operation: () => Promise<unknown>) => {
    const rows = new Map([...mockRows].map(([key, value]) => [key, { ...value }]));
    const points = mockPointRows.map(value => ({ ...value }));
    const edges = mockMetricEdges.map(value => ({ ...value }));
    const splits = mockSplits.map(value => ({ ...value }));
    const gps = new Map([...mockGpsStates].map(([key, value]) => [key, { ...value }]));
    const binding = mockActiveBinding ? { ...mockActiveBinding } : null;
    try { return await operation(); }
    catch (error) {
      mockRows.clear(); rows.forEach((value, key) => mockRows.set(key, value));
      mockPointRows.splice(0, mockPointRows.length, ...points);
      mockMetricEdges.splice(0, mockMetricEdges.length, ...edges);
      mockSplits.splice(0, mockSplits.length, ...splits);
      mockGpsStates.clear(); gps.forEach((value, key) => mockGpsStates.set(key, value));
      mockActiveBinding = binding;
      throw error;
    }
  }),
  run: jest.fn(async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT INTO tracking_active_gps_binding')) {
      if (mockActiveBinding) return { changes: 0 };
      const [owner_id, session_id, generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms] = args;
      mockActiveBinding = { binding_key: 'active_gps', owner_id, session_id, generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms };
      return { changes: 1 };
    }
    if (sql.startsWith('UPDATE tracking_active_gps_binding SET')) {
      const [generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms, owner_id, session_id, expectedGeneration] = args;
      if (!mockActiveBinding || mockActiveBinding.owner_id !== owner_id || mockActiveBinding.session_id !== session_id || mockActiveBinding.generation !== expectedGeneration) return { changes: 0 };
      Object.assign(mockActiveBinding, { generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms });
      return { changes: 1 };
    }
    if (sql.startsWith('DELETE FROM tracking_active_gps_binding')) {
      const [owner_id, session_id, generation] = args;
      if (!mockActiveBinding || mockActiveBinding.owner_id !== owner_id || mockActiveBinding.session_id !== session_id || mockActiveBinding.generation !== generation) return { changes: 0 };
      mockActiveBinding = null;
      return { changes: 1 };
    }
    if (sql.startsWith('DELETE FROM tracking_points')) {
      const [sessionId, boundary] = args;
      for (let index = mockPointRows.length - 1; index >= 0; index -= 1) {
        const matches = sql.includes('segment = ?') ? mockPointRows[index]?.segment === boundary : Number(mockPointRows[index]?.timestamp_ms) > Number(boundary);
        if (mockPointRows[index]?.session_id === sessionId && matches) mockPointRows.splice(index, 1);
      }
      return { changes: 1 };
    }
    if (sql.startsWith('DELETE FROM tracking_metric_edges')) {
      const [ownerId, sessionId, boundary] = args;
      for (let index = mockMetricEdges.length - 1; index >= 0; index -= 1) {
        const matches = sql.includes('segment = ?') ? mockMetricEdges[index]?.segment === boundary : Number(mockMetricEdges[index]?.observation_timestamp_ms) > Number(boundary);
        if (mockMetricEdges[index]?.owner_id === ownerId && mockMetricEdges[index]?.session_id === sessionId && matches) mockMetricEdges.splice(index, 1);
      }
      return { changes: 1 };
    }
    if (sql.startsWith('DELETE FROM tracking_km_splits')) {
      const [ownerId, sessionId] = args;
      for (let index = mockSplits.length - 1; index >= 0; index -= 1) if (mockSplits[index]?.owner_id === ownerId && mockSplits[index]?.session_id === sessionId) mockSplits.splice(index, 1);
      return { changes: 1 };
    }
    if (sql.startsWith('INSERT INTO tracking_sessions')) {
      const [id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason] = args;
      mockRows.set(String(id), { id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason, feedback_json: null });
    }
    if (sql.startsWith("UPDATE tracking_sessions SET state = 'recording'")) {
      const [segments_json, checkpoint_at_ms, id, owner_id] = args;
      const row = mockRows.get(String(id));
      if (!row || row.owner_id !== owner_id || row.state !== 'paused') return { changes: 0 };
      Object.assign(row, { state: 'recording', segments_json, checkpoint_at_ms });
      return { changes: 1 };
    }
    if (sql.startsWith("UPDATE tracking_sessions SET state = 'paused'")) {
      const hasDistance = sql.includes('distance_meters = ?');
      const [segments_json, checkpoint_at_ms, distance_meters, distanceId, distanceOwner] = args;
      const id = hasDistance ? distanceId : args[2];
      const owner_id = hasDistance ? distanceOwner : args[3];
      const row = mockRows.get(String(id));
      if (!row || row.owner_id !== owner_id || row.state !== 'recording') return { changes: 0 };
      Object.assign(row, { state: 'paused', segments_json, checkpoint_at_ms, ...(hasDistance ? { distance_meters } : {}) });
      return { changes: 1 };
    }
    if (sql.startsWith('UPDATE tracking_sessions SET state =')) {
      const [state, ended_at_ms, checkpoint_at_ms, segments_json, distanceA, distanceB, status_reason, id, owner_id] = args;
      const row = mockRows.get(String(id));
      if (row && row.owner_id === owner_id) Object.assign(row, { state, ended_at_ms, checkpoint_at_ms: Math.max(Number(row.checkpoint_at_ms), Number(checkpoint_at_ms)), segments_json, distance_meters: row.distance_meters === null ? distanceA : Math.max(Number(row.distance_meters), Number(distanceB)), status_reason });
    }
    if (sql.startsWith('UPDATE tracking_sessions SET distance_meters =')) {
      const [distance, checkpoint, id, owner] = args; const row = mockRows.get(String(id));
      if (row && row.owner_id === owner && ['recording', 'paused', 'finishing'].includes(String(row.state))) Object.assign(row, { distance_meters: distance, checkpoint_at_ms: checkpoint });
    }
    if (sql.startsWith('UPDATE tracking_sessions SET checkpoint_at_ms')) {
      const [checkpoint, id, owner] = args; const row = mockRows.get(String(id));
      if (row && row.owner_id === owner && row.state === 'recording') row.checkpoint_at_ms = Math.max(Number(row.checkpoint_at_ms), Number(checkpoint));
    }
    if (sql.startsWith('INSERT INTO tracking_points')) {
      const [id, session_id, timestamp_ms, latitude, longitude, accuracy_meters, segment] = args;
      if (mockPointRows.some((point) => point.session_id === session_id && point.timestamp_ms === timestamp_ms)) return { changes: 0 };
      mockPointRows.push({ id, session_id, timestamp_ms, latitude, longitude, accuracy_meters, segment });
    }
    if (sql.startsWith('INSERT INTO tracking_metric_edges')) {
      const [id, owner_id, session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version] = args;
      if (mockMetricEdges.some(edge => edge.session_id === session_id && edge.observation_timestamp_ms === observation_timestamp_ms)) return { changes: 0 };
      mockMetricEdges.push({ id, owner_id, session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version });
    }
    if (sql.startsWith('INSERT INTO tracking_km_splits')) {
      const [id, owner_id, session_id, kilometre, crossing_active_ms, duration_ms, pace_sec_per_km, gps_coverage, metric_version, split_version] = args;
      if (!mockSplits.some(split => split.session_id === session_id && split.kilometre === kilometre)) mockSplits.push({ id, owner_id, session_id, kilometre, crossing_active_ms, duration_ms, pace_sec_per_km, gps_coverage, metric_version, split_version });
    }
    if (sql.startsWith('INSERT INTO tracking_gps_state')) {
      const [session_id, owner_id, last_received_timestamp_ms, last_accepted_timestamp_ms, last_valid_observation_timestamp_ms, accuracy_meters, quality_state, reason_codes_json, task_error_code, task_error_count, accept_until_ms, updated_at_ms] = args;
      mockGpsStates.set(String(session_id), { session_id, owner_id, last_received_timestamp_ms, last_accepted_timestamp_ms, last_valid_observation_timestamp_ms, accuracy_meters, quality_state, reason_codes_json, task_error_code, task_error_count, accept_until_ms, updated_at_ms });
    }
    if (sql.startsWith('UPDATE tracking_sessions SET feedback_json')) { const row = mockRows.get(String(args[1])); if (row && row.owner_id === args[2]) row.feedback_json = args[0]; }
    return { changes: 1 };
  }),
  getFirst: jest.fn(async (sql: string, args: unknown[] = []) => {
    const rows = [...mockRows.values()];
    if (sql.includes('FROM tracking_active_gps_binding')) return mockActiveBinding;
    if (sql.includes('COUNT(*) AS count FROM tracking_points')) return { count: mockPointRows.filter(point => point.session_id === args[0] && Number(point.timestamp_ms) > Number(args[1])).length };
    if (sql.includes('FROM tracking_metric_edges') && sql.includes('ORDER BY observation_timestamp_ms DESC LIMIT 1')) return mockMetricEdges.filter(edge => edge.owner_id === args[0] && edge.session_id === args[1]).sort((a,b)=>Number(b.observation_timestamp_ms)-Number(a.observation_timestamp_ms))[0] ?? null;
    if (sql.includes('FROM tracking_points') && sql.includes('ORDER BY timestamp_ms DESC LIMIT 1')) return mockPointRows.filter(point => point.session_id === args[0]).sort((a,b)=>Number(b.timestamp_ms)-Number(a.timestamp_ms))[0] ?? null;
    if (sql.includes('SELECT id FROM tracking_sessions WHERE id')) { const row = mockRows.get(String(args[0])); return row?.owner_id === args[1] ? { id: row.id } : null; }
    if (sql.includes('FROM tracking_points') && sql.includes('timestamp_ms = ?')) return mockPointRows.find(point => point.session_id === args[0] && point.timestamp_ms === args[1]) ?? null;
    if (sql.includes('FROM tracking_gps_state')) { const row = mockGpsStates.get(String(args[0])); return row?.owner_id === args[1] ? row : null; }
    if (sql.includes("state IN ('recording','paused','finishing','interrupted')") && sql.includes('id = ? AND owner_id = ?')) { const row = mockRows.get(String(args[0])); return row?.owner_id === args[1] && ['recording', 'paused', 'finishing', 'interrupted'].includes(String(row.state)) ? row : null; }
    if (sql.includes("state = 'recording'") && sql.includes('id = ? AND owner_id = ?')) { const row = mockRows.get(String(args[0])); return row?.owner_id === args[1] && row.state === 'recording' ? row : null; }
    if (sql.includes('FROM tracking_km_splits') && sql.includes('ORDER BY kilometre DESC')) return mockSplits.filter(split => split.owner_id === args[0] && split.session_id === args[1]).sort((a,b)=>Number(b.kilometre)-Number(a.kilometre))[0] ?? null;
    if (sql.includes('WHERE id = ? AND owner_id = ?')) { const row = mockRows.get(String(args[0])); return row?.owner_id === args[1] ? row : null; }
    if (sql.includes("state IN ('recording'")) return rows.find((row) => row.owner_id === args[0] && ['recording', 'paused', 'finishing', 'interrupted'].includes(String(row.state))) ?? null;
    if (sql.includes("state = 'saved'")) return rows.find((row) => row.owner_id === args[0] && row.planned_session_id === args[1] && row.state === 'saved' && row.feedback_json === null) ?? null;
    return null;
  }),
  getAll: jest.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM tracking_points')) { const points = mockPointRows.filter(point => point.session_id === args[0] && (!sql.includes('segment = ?') || point.segment === args[1])).sort((a, b) => sql.includes('DESC') ? Number(b.timestamp_ms) - Number(a.timestamp_ms) : Number(a.timestamp_ms) - Number(b.timestamp_ms)); return (sql.includes('LIMIT 1') ? points.slice(0, 1) : sql.includes('LIMIT 20') ? points.slice(0, 20) : points) as never; }
    if (sql.includes('FROM tracking_metric_edges')) return mockMetricEdges.filter(edge => edge.owner_id === args[0] && edge.session_id === args[1]).sort((a,b)=>Number(a.observation_timestamp_ms)-Number(b.observation_timestamp_ms)) as never;
    if (sql.includes('FROM tracking_km_splits')) return mockSplits.filter(split => split.owner_id === args[0] && split.session_id === args[1]).sort((a,b)=>Number(a.kilometre)-Number(b.kilometre)) as never;
    return [];
  }),
};
let mockUpdatesStarted = false;
jest.mock('@/data/migrations', () => ({ migrate: async () => undefined }));
jest.mock('@/application/workoutDiagnostics', () => ({ addWorkoutCheckpoint: jest.fn() }));
jest.mock('@/application/trackerIdentity', () => ({ getTrackerOwnerId: async () => 'account-test' }));
jest.mock('expo-task-manager', () => ({ isTaskDefined: jest.fn(() => false), defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, hasServicesEnabledAsync: jest.fn(async () => true), getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })), requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })), getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })), requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })), getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 3 }, timestamp: Date.now() })), hasStartedLocationUpdatesAsync: jest.fn(async () => mockUpdatesStarted), startLocationUpdatesAsync: jest.fn(async () => { mockUpdatesStarted = true; }), stopLocationUpdatesAsync: jest.fn(async () => { mockUpdatesStarted = false; }) }));
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: async () => mockDatabase }));

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
  const locationApi = jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock };
  expect(locationApi.startLocationUpdatesAsync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ foregroundService: expect.objectContaining({ notificationTitle: 'Torto workout in progress', killServiceOnDestroy: false }) }));
  expect((jest.requireMock('expo-task-manager') as { defineTask: jest.Mock }).defineTask).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
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
  const locationApi = jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock; stopLocationUpdatesAsync: jest.Mock };
  locationApi.startLocationUpdatesAsync.mockClear(); locationApi.stopLocationUpdatesAsync.mockClear(); mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(1000000);
  let last: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { last = snapshot; });
  await startTracker({ sessionId: 'session-1', revisionId: 'revision-1', prescription: '{"planned":true}', mode: 'walk', timerOnly: false });
  const location = (latitude: number, timestamp: number) => ({ coords: { latitude, longitude: 0, accuracy: 3 }, timestamp } as LocationObject);
  jest.setSystemTime(1010000); await persistLocationBatch([location(0.0001, 1010000)]);
  await syncTrackerFromPersistence();
  const activeSessionId = [...mockRows.values()].find((row) => row.state === 'recording' && row.planned_session_id === 'session-1')?.id;
  expect(mockPointRows.filter((point) => point.session_id === activeSessionId)).toHaveLength(2);
  await pauseTracker(); jest.setSystemTime(1020000); await resumeTracker();
  await persistLocationBatch([location(0.001, 1020000)]); await syncTrackerFromPersistence();
  expect(last?.session.distanceMeters).toBeGreaterThan(10);
  expect(last?.session.distanceMeters).toBeLessThan(12);
  jest.setSystemTime(1025000); const result = await finishTracker();
  expect(result.session.segments).toEqual([{ startedAtMs: 1000000, endedAtMs: 1010000 }, { startedAtMs: 1020000, endedAtMs: 1025000 }]);
  expect(result.session.status).toBe('saved');
  expect((await pendingWorkout('session-1'))?.id).toBe(result.session.id);
  await markWorkoutFeedbackSaved(result.session.id);
  expect(await pendingWorkout('session-1')).toBeNull();
  expect(locationApi.startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  expect(locationApi.stopLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  unsubscribe(); jest.useRealTimers();
});

it('shows Resume and Finish only for a manually paused session, with an explicit resuming state', () => {
  expect(trackerControlState('recording')).toMatchObject({ pauseVisible: true, resumeVisible: false, finishVisible: true });
  expect(trackerControlState('paused')).toMatchObject({ pauseVisible: false, resumeVisible: true, resumeLabel: 'Resume', finishVisible: true });
  expect(trackerControlState('paused', 'resuming')).toMatchObject({ resumeVisible: true, resumeLabel: 'Resuming…', visibleStatus: 'RESUMING' });
  // An interrupted recording needs review and must not be silently resumed.
  expect(trackerControlState('interrupted')).toMatchObject({ pauseVisible: false, resumeVisible: false, finishVisible: true });
});

it('keeps one session through repeated pause/resume cycles and excludes paused time and GPS movement', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(1000000);
  let latest: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { latest = snapshot; });
  const location = (latitude: number, timestamp: number) => ({ coords: { latitude, longitude: 0, accuracy: 3 }, timestamp } as LocationObject);
  await startTracker({ mode: 'run' });
  const sessionId = latest?.session.id;
  expect(sessionId).toBeTruthy();

  jest.setSystemTime(1010000); await pauseTracker();
  expect(latest?.session.status).toBe('paused');
  await persistLocationBatch([location(0.001, 1015000)]); // A late point while paused is ignored.
  jest.setSystemTime(1020000); await resumeTracker();
  expect(latest?.session.id).toBe(sessionId);
  await persistLocationBatch([location(0.0001, 1021000), location(0.0002, 1030000)]);
  jest.setSystemTime(1040000); await pauseTracker();
  expect(latest?.session.status).toBe('paused');
  jest.setSystemTime(1050000); await resumeTracker();
  expect(latest?.session.id).toBe(sessionId);
  await persistLocationBatch([location(0.0003, 1051000), location(0.0004, 1060000)]);
  jest.setSystemTime(1070000);
  const finished = await finishTracker();

  expect(finished.session.id).toBe(sessionId);
  expect(finished.session.status).toBe('saved');
  expect(mockRows.size).toBe(1);
  expect(activeSeconds(finished.session.segments, 1070000)).toBe(50);
  expect(finished.session.segments).toEqual([
    { startedAtMs: 1000000, endedAtMs: 1010000 },
    { startedAtMs: 1020000, endedAtMs: 1040000 },
    { startedAtMs: 1050000, endedAtMs: 1070000 },
  ]);
  expect(mockPointRows.filter((point) => point.session_id === sessionId).some((point) => point.timestamp_ms === 1015000)).toBe(false);
  expect(finished.session.distanceMeters).toBeLessThan(30); // The paused jump was never included.
  unsubscribe(); jest.useRealTimers();
});

it('does not overwrite Pause with a late pre-pause persistence read', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(2000000);
  await startTracker({ mode: 'run' });
  const stored = [...mockRows.values()][0]!;
  let releaseRead: ((row: Record<string, unknown>) => void) | undefined;
  let readStarted = false;
  const originalGetFirst = mockDatabase.getFirst.getMockImplementation()!;
  mockDatabase.getFirst.mockImplementationOnce((sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM tracking_sessions WHERE id')) {
      readStarted = true;
      return new Promise((resolve) => { releaseRead = resolve as (row: Record<string, unknown>) => void; });
    }
    return originalGetFirst(sql, args);
  });
  const staleRead = syncTrackerFromPersistence();
  for (let attempt = 0; attempt < 20 && !readStarted; attempt += 1) await Promise.resolve();
  expect(readStarted).toBe(true);
  jest.setSystemTime(2010000); await pauseTracker();
  releaseRead?.({ ...stored, segments_json: JSON.stringify([{ startedAtMs: 2000000, endedAtMs: null }]) });
  await staleRead;
  expect((await recoverTracker())?.session.status).toBe('paused');
  jest.useRealTimers();
});

it('publishes a sanitised refresh failure and clears it after a successful persisted reload', async () => {
  mockUpdatesStarted = false;
  await startTracker({ mode: 'run' });
  let latest: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { latest = snapshot; });
  const originalGetFirst = mockDatabase.getFirst.getMockImplementation()!;
  mockDatabase.getFirst.mockImplementationOnce((sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM tracking_sessions WHERE id')) throw new Error('SQLite I/O failure');
    return originalGetFirst(sql, args);
  });
  await expect(syncTrackerFromPersistence()).rejects.toThrow('SQLite I/O failure');
  expect(latest?.refreshHealth).toMatchObject({ status: 'failed', errorStage: 'session_lookup', errorCode: 'database_unavailable' });
  mockDatabase.getFirst.mockImplementation(originalGetFirst);
  await syncTrackerFromPersistence();
  expect(latest?.refreshHealth).toMatchObject({ status: 'recovered', errorStage: null, errorCode: null });
  unsubscribe(); await discardTracker();
});

it('keeps failed evidence untrustworthy through retry and ignores an older late failure', async () => {
  mockUpdatesStarted = false;
  await startTracker({ mode: 'run' });
  let latest: Parameters<Parameters<typeof subscribeTracker>[0]>[0] = null;
  const unsubscribe = subscribeTracker((snapshot) => { latest = snapshot; });
  const originalGetFirst = mockDatabase.getFirst.getMockImplementation()!;
  mockDatabase.getFirst.mockImplementationOnce((sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM tracking_sessions WHERE id')) throw new Error('SQLite first failure');
    return originalGetFirst(sql, args);
  });
  await expect(syncTrackerFromPersistence()).rejects.toThrow('SQLite first failure');
  expect(latest?.refreshHealth.status).toBe('failed');

  let rejectRetry: ((reason: Error) => void) | null = null;
  mockDatabase.getFirst.mockImplementationOnce((sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT * FROM tracking_sessions WHERE id')) return new Promise((_resolve, reject) => { rejectRetry = reject; });
    return originalGetFirst(sql, args);
  });
  const olderRetry = syncTrackerFromPersistence();
  for (let attempt = 0; attempt < 20 && !rejectRetry; attempt += 1) await Promise.resolve();
  expect(latest?.refreshHealth.status).toBe('recovering');

  mockDatabase.getFirst.mockImplementation(originalGetFirst);
  await syncTrackerFromPersistence();
  expect(latest?.refreshHealth.status).toBe('recovered');
  rejectRetry?.(new Error('SQLite late retry failure'));
  await expect(olderRetry).rejects.toThrow('SQLite late retry failure');
  expect(latest?.refreshHealth).toMatchObject({ status: 'recovered', errorStage: null, errorCode: null });
  unsubscribe(); await discardTracker();
});

it('distinguishes Android precise and approximate location permission', () => {
  expect(androidLocationPrecision({ android: { accuracy: 'fine' } } as never)).toBe('precise');
  expect(androidLocationPrecision({ android: { accuracy: 'coarse' } } as never)).toBe('approximate');
  expect(androidLocationPrecision({ android: undefined } as never)).toBe('unknown');
});

it('does not reconcile AppState over an explicit Pause that is still saving', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(2500000);
  const location = jest.requireMock('expo-location') as { stopLocationUpdatesAsync: jest.Mock; getBackgroundPermissionsAsync: jest.Mock };
  await startTracker({ mode: 'run' });
  location.getBackgroundPermissionsAsync.mockClear();
  let releaseStop: (() => void) | undefined;
  location.stopLocationUpdatesAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseStop = resolve; }));
  const pausing = pauseTracker();
  for (let attempt = 0; attempt < 200 && !releaseStop; attempt += 1) await Promise.resolve();
  expect(releaseStop).toBeDefined();
  mockUpdatesStarted = false; // Native stop has taken effect while its async acknowledgement is pending.
  await handleTrackerAppStateChange('active');
  expect(location.getBackgroundPermissionsAsync).not.toHaveBeenCalled();
  releaseStop?.();
  await pausing;
  expect((await recoverTracker())?.session.status).toBe('paused');
  jest.useRealTimers();
});

it('keeps the same session paused when location permission is revoked before Resume', async () => {
  mockUpdatesStarted = false;
  const location = jest.requireMock('expo-location') as { getBackgroundPermissionsAsync: jest.Mock; requestBackgroundPermissionsAsync: jest.Mock; startLocationUpdatesAsync: jest.Mock };
  location.startLocationUpdatesAsync.mockClear();
  jest.useFakeTimers(); jest.setSystemTime(3000000);
  await startTracker({ mode: 'run' });
  const id = [...mockRows.values()][0]?.id;
  await pauseTracker();
  location.getBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  location.requestBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await expect(resumeTracker()).rejects.toThrow('Allow location all the time');
  expect((await recoverTracker())?.session).toMatchObject({ id, status: 'paused' });
  // Permission is checked before durable Resume intent, so the already-paused
  // session and its last reliable GPS state remain untouched.
  expect(mockGpsStates.get(String(id))).toMatchObject({ quality_state: 'reliable', task_error_code: null });
  expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('serializes two fast Resume taps into one GPS restart and one activity', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(3500000);
  const location = jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock };
  location.startLocationUpdatesAsync.mockClear();
  await startTracker({ mode: 'run' });
  await pauseTracker();
  let releaseStart: (() => void) | undefined;
  location.startLocationUpdatesAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseStart = resolve; }));
  const firstResume = resumeTracker();
  for (let attempt = 0; attempt < 300 && !releaseStart; attempt += 1) await Promise.resolve();
  expect(releaseStart).toBeDefined();
  await resumeTracker(); // Duplicate tap while the first service start is pending.
  releaseStart?.();
  await firstResume;
  expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(2); // Initial start + exactly one resume.
  expect(mockRows.size).toBe(1);
  expect((await recoverTracker())?.session.status).toBe('recording');
  await discardTracker();
  jest.useRealTimers();
});

it('compensates a failed native restart without reusing the consumed generation', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(3600000);
  const location = jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock };
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  jest.setSystemTime(3610000); await pauseTracker();
  jest.setSystemTime(3620000);
  location.startLocationUpdatesAsync.mockRejectedValueOnce(new Error('native restart failed'));
  await expect(resumeTracker()).rejects.toThrow('native restart failed');
  expect(mockRows.get(sessionId)).toMatchObject({ state: 'paused' });
  expect(mockActiveBinding).toMatchObject({ session_id: sessionId, generation: 2, lifecycle_state: 'paused', quarantine_state: 'blocked' });
  expect(mockPointRows.some(point => point.session_id === sessionId && point.timestamp_ms === 3620000)).toBe(false);
  expect(mockMetricEdges.some(edge => edge.session_id === sessionId && edge.observation_timestamp_ms === 3620000)).toBe(false);
  expect(mockRows.get(sessionId)?.distance_meters).toBe(0);
  await discardTracker(); jest.useRealTimers();
});

it('keeps Resume pending and preserves rollback checkpoint until native startup succeeds', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6900000);
  await startTracker({ mode: 'run' });
  await pauseTracker();
  jest.setSystemTime(6910000);
  const location = jest.requireMock('expo-location');
  location.startLocationUpdatesAsync.mockImplementationOnce(async () => {
    expect(mockActiveBinding).toMatchObject({ resume_state: 'native_start_pending', resume_distance_meters: 0, quarantine_state: 'pending' });
    throw new Error('native start rejected while pending');
  });
  await expect(resumeTracker()).rejects.toThrow('native start rejected while pending');
});

it('keeps evidence quarantined when compensation and recovery marking both fail', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6920000);
  await startTracker({ mode: 'run' }); await pauseTracker();
  jest.setSystemTime(6930000);
  const sessionId = String(mockActiveBinding?.session_id);
  jest.requireMock('expo-location').startLocationUpdatesAsync.mockImplementationOnce(async () => {
    mockDatabase.run.mockRejectedValueOnce(new Error('compensation unavailable')).mockRejectedValueOnce(new Error('recovery marking unavailable'));
    throw new Error('native failed');
  });
  await expect(resumeTracker()).rejects.toThrow('compensation unavailable');
  expect(mockActiveBinding).toMatchObject({ resume_state: 'native_start_pending', quarantine_state: 'pending' });
  expect(mockRows.get(sessionId)?.state).toBe('recording');
  const later = await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6935000 } as LocationObject], 6935000);
  expect(later).toEqual({ acceptedEvidence: false, rejectionReason: 'pipeline_quarantine' });
});

it('rejects movement before confirmation and compensates a failed confirmation transaction', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6960000);
  await startTracker({ mode: 'run' }); await pauseTracker();
  jest.setSystemTime(6970000);
  const sessionId = String(mockActiveBinding?.session_id);
  jest.requireMock('expo-location').startLocationUpdatesAsync.mockImplementationOnce(async () => {
    expect(mockActiveBinding).toMatchObject({ resume_state: 'native_start_pending', quarantine_state: 'pending' });
    const { confirmGpsResume } = jest.requireActual('@/application/backgroundGpsTask');
    await expect(confirmGpsResume(sessionId, 'account-test', 1, { timestampMs: 6970000, latitude: 0, longitude: 0, accuracyMeters: 3 })).rejects.toThrow('stale_resume_confirmation');
    expect(mockActiveBinding?.resume_state).toBe('native_start_pending');
    const result = await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6971000 } as LocationObject], 6971000);
    expect(result.acceptedEvidence).toBe(false);
    mockDatabase.run.mockRejectedValueOnce(new Error('confirmation unavailable'));
  });
  await expect(resumeTracker()).rejects.toThrow('confirmation unavailable');
  expect(mockRows.get(sessionId)).toMatchObject({ state: 'paused', distance_meters: 0 });
  expect(mockActiveBinding).toMatchObject({ generation: 2, quarantine_state: 'blocked' });
});

it('rebuilds legacy Metric V1 distance when compensating a failed Resume segment', async () => {
  mockRows.set('legacy-resume', { id: 'legacy-resume', owner_id: 'account-test', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 4000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: 3000 }, { startedAtMs: 4000, endedAtMs: null }]), distance_meters: 22.238, metric_version: 1, status_reason: 'gps', feedback_json: null });
  mockPointRows.push(
    { id: 'p1', session_id: 'legacy-resume', timestamp_ms: 1000, latitude: 0, longitude: 0, accuracy_meters: 3, segment: 0 },
    { id: 'p2', session_id: 'legacy-resume', timestamp_ms: 2000, latitude: 0.0001, longitude: 0, accuracy_meters: 3, segment: 0 },
    { id: 'p3', session_id: 'legacy-resume', timestamp_ms: 4000, latitude: 0.0001, longitude: 0, accuracy_meters: 3, segment: 1 },
    { id: 'p4', session_id: 'legacy-resume', timestamp_ms: 5000, latitude: 0.0002, longitude: 0, accuracy_meters: 3, segment: 1 },
  );
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-test', session_id: 'legacy-resume', generation: 2, lifecycle_state: 'recording', cutoff_ms: null, resume_distance_meters: 11.119, updated_at_ms: 4000 };
  await compensateGpsResumeFailure('legacy-resume', 'account-test', 2, 4000, 6000);
  expect(mockRows.get('legacy-resume')).toMatchObject({ state: 'paused' });
  expect(Number(mockRows.get('legacy-resume')?.distance_meters)).toBeCloseTo(11.119, 2);
  expect(mockPointRows.some(point => point.session_id === 'legacy-resume' && point.segment === 1)).toBe(false);
});

it('preserves an actual paused Metric V1 checkpoint through failed native Resume', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6940000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  await pauseTracker();
  Object.assign(mockRows.get(sessionId)!, { metric_version: 1, distance_meters: 321.5 });
  // Retained route evidence intentionally cannot reconstruct 321.5 metres.
  expect(mockPointRows.filter(point => point.session_id === sessionId)).toHaveLength(1);
  jest.setSystemTime(6950000);
  jest.requireMock('expo-location').startLocationUpdatesAsync.mockRejectedValueOnce(new Error('legacy native start failed'));
  await expect(resumeTracker()).rejects.toThrow('legacy native start failed');
  expect(mockRows.get(sessionId)).toMatchObject({ state: 'paused', distance_meters: 321.5 });
  expect(mockActiveBinding).toMatchObject({ generation: 2, resume_state: 'confirmed', resume_distance_meters: null });
});

it('rebuilds splits and restores the previous GPS anchor after failed Resume compensation', async () => {
  mockRows.set('metric-resume', { id: 'metric-resume', owner_id: 'account-test', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 4000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: 3000 }, { startedAtMs: 4000, endedAtMs: null }]), distance_meters: 1010, metric_version: 3, status_reason: 'gps', feedback_json: null });
  mockPointRows.push(
    { id: 'm1', session_id: 'metric-resume', timestamp_ms: 2000, latitude: 0.0089, longitude: 0, accuracy_meters: 3, segment: 0 },
    { id: 'm2', session_id: 'metric-resume', timestamp_ms: 4000, latitude: 0.0091, longitude: 0, accuracy_meters: 4, segment: 1 },
  );
  mockMetricEdges.push(
    { id: 'e1', owner_id: 'account-test', session_id: 'metric-resume', observation_timestamp_ms: 2000, processing_timestamp_ms: 2000, segment: 0, distance_increment_meters: 990, cumulative_distance_meters: 990, active_elapsed_ms: 1000, accuracy_meters: 3, edge_kind: 'movement', metric_version: 3 },
    { id: 'e2', owner_id: 'account-test', session_id: 'metric-resume', observation_timestamp_ms: 4000, processing_timestamp_ms: 4000, segment: 1, distance_increment_meters: 20, cumulative_distance_meters: 1010, active_elapsed_ms: 2000, accuracy_meters: 4, edge_kind: 'movement', metric_version: 3 },
  );
  mockSplits.push({ id: 's1', owner_id: 'account-test', session_id: 'metric-resume', kilometre: 1, crossing_active_ms: 1500, duration_ms: 1500, pace_sec_per_km: 1.5, gps_coverage: 'continuous', metric_version: 3, split_version: 1 });
  mockGpsStates.set('metric-resume', { session_id: 'metric-resume', owner_id: 'account-test', last_received_timestamp_ms: 4000, last_accepted_timestamp_ms: 4000, last_valid_observation_timestamp_ms: 4000, accuracy_meters: 4, quality_state: 'reliable', reason_codes_json: '[]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: 4000 });
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-test', session_id: 'metric-resume', generation: 2, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 4000 };
  await compensateGpsResumeFailure('metric-resume', 'account-test', 2, 4000, 6000);
  expect(mockRows.get('metric-resume')).toMatchObject({ state: 'paused', distance_meters: 990 });
  expect(mockMetricEdges).toHaveLength(1);
  expect(mockSplits).toHaveLength(0);
  expect(mockGpsStates.get('metric-resume')).toMatchObject({ last_accepted_timestamp_ms: 2000, last_valid_observation_timestamp_ms: 2000, accuracy_meters: 3, accept_until_ms: 3000 });
});

it('finishes a manually paused workout and leaves it paused during AppState changes', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(4000000);
  await startTracker({ mode: 'run' });
  const id = [...mockRows.values()][0]?.id;
  await pauseTracker();
  const location = jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock; stopLocationUpdatesAsync: jest.Mock };
  const startsBefore = location.startLocationUpdatesAsync.mock.calls.length;
  handleTrackerAppStateChange('background');
  await handleTrackerAppStateChange('active');
  expect((await recoverTracker())?.session).toMatchObject({ id, status: 'paused' });
  expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(startsBefore);
  const saved = await finishTracker();
  expect(saved.session).toMatchObject({ id, status: 'saved' });
  expect(mockRows.size).toBe(1);
  jest.useRealTimers();
});

it('requires GPS in tracker mode and does not start a timer-only recording', async () => {
  await expect(startTracker({ mode: 'run', timerOnly: true })).rejects.toThrow('GPS is required');
  expect(await recoverTracker()).toBeNull();
});

it('persists route points once, sorts batches and ignores duplicate or out-of-order points', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(3000000);
  await startTracker({ mode: 'run' });
  const sample = (latitude: number, timestamp: number) => ({ coords: { latitude, longitude: 0, accuracy: 3 }, timestamp } as LocationObject);
  await Promise.all([
    persistLocationBatch([sample(0.0002, 3002000), sample(0.0001, 3001000)]),
    persistLocationBatch([sample(0.0001, 3001000), sample(0.0003, 3003000)]),
  ]);
  const points = mockPointRows.filter((point) => point.session_id === [...mockRows.values()].find((row) => row.state === 'recording')?.id);
  expect(points.map((point) => point.timestamp_ms)).toEqual([3000000, 3001000, 3002000, 3003000]);
  const active = [...mockRows.values()].find((row) => row.state === 'recording');
  expect(Number(active?.distance_meters)).toBeGreaterThan(30);
  await discardTracker(); jest.useRealTimers();
});

it('routes background evidence only to the explicitly bound owner and session', async () => {
  jest.useFakeTimers(); jest.setSystemTime(3050000);
  await startTracker({ mode: 'run' });
  const bound = [...mockRows.values()].find(row => row.state === 'recording')!;
  mockRows.set('newer-other-account', { id: 'newer-other-account', owner_id: 'account-other', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 3050000, ended_at_ms: null, checkpoint_at_ms: 9999999, segments_json: JSON.stringify([{ startedAtMs: 3050000, endedAtMs: null }]), distance_meters: 0, metric_version: 3, status_reason: 'gps', feedback_json: null });
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 3051000 } as LocationObject], 3051000);
  expect(Number(bound.distance_meters)).toBeGreaterThan(10);
  expect(mockRows.get('newer-other-account')?.distance_meters).toBe(0);
  expect(mockPointRows.some(point => point.session_id === 'newer-other-account')).toBe(false);
  await discardTracker(); jest.useRealTimers();
});

it('does not replace another account active GPS binding when starting', async () => {
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-other', session_id: 'other-session', generation: 4, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 1 };
  mockRows.set('other-session', { id: 'other-session', owner_id: 'account-other', state: 'recording', checkpoint_at_ms: 1, segments_json: JSON.stringify([{ startedAtMs: 1, endedAtMs: null }]), distance_meters: 0, metric_version: 3 });
  await expect(startTracker({ mode: 'run' })).rejects.toThrow('active_gps_session_exists:account-other:other-session');
  expect(mockActiveBinding).toMatchObject({ owner_id: 'account-other', session_id: 'other-session', generation: 4 });
  expect([...mockRows.values()].some(row => row.owner_id === 'account-test' && row.state === 'recording')).toBe(false);
});

it('reclaims an orphaned binding only when its session is absent', async () => {
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-old', session_id: 'missing-session', generation: 2, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 1 };
  await startTracker({ mode: 'run' });
  expect(mockActiveBinding).toMatchObject({ owner_id: 'account-test', generation: 1, lifecycle_state: 'recording' });
  await discardTracker();
});

it('durably interrupts and releases the binding before account exit', async () => {
  jest.useFakeTimers(); jest.setSystemTime(3060000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  jest.setSystemTime(3065000);
  await prepareTrackerForAccountExit('account-test');
  expect(mockRows.get(sessionId)).toMatchObject({ state: 'interrupted' });
  expect(mockActiveBinding).toBeNull();
  const recovered = await recoverTracker();
  expect(recovered?.session).toMatchObject({ id: sessionId, status: 'interrupted', ownerId: 'account-test' });
  await discardTracker(); jest.useRealTimers();
});

it('retains recording ownership when account-exit cutoff persistence fails', async () => {
  jest.useFakeTimers(); jest.setSystemTime(3066000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  const implementation = mockDatabase.run.getMockImplementation()!;
  mockDatabase.run.mockImplementation(async (sql, args) => {
    if (sql.startsWith('INSERT INTO tracking_gps_state') && mockActiveBinding?.account_transition_pending === 1) throw new Error('cutoff storage unavailable');
    return implementation(sql, args);
  });

  try { await expect(prepareTrackerForAccountExit('account-test')).rejects.toThrow('cutoff storage unavailable'); }
  finally { mockDatabase.run.mockImplementation(implementation); }
  expect(mockActiveBinding).toMatchObject({ account_transition_pending: 1, owner_id: 'account-test' });

  expect(mockRows.get(sessionId)).toMatchObject({ owner_id: 'account-test', state: 'recording' });
  expect(mockActiveBinding).toMatchObject({ owner_id: 'account-test', session_id: sessionId });
  await discardTracker(); jest.useRealTimers();
});

it('rolls back Resume intent when binding generation persistence fails', async () => {
  jest.useFakeTimers(); jest.setSystemTime(3067000);
  await startTracker({ mode: 'run' });
  jest.setSystemTime(3068000);
  await pauseTracker();
  const sessionId = String(mockActiveBinding?.session_id);
  const originalRun = mockDatabase.run.getMockImplementation()!;
  let rejectBindingUpdate = true;
  mockDatabase.run.mockImplementation((sql: string, args: unknown[]) => {
    if (rejectBindingUpdate && sql.startsWith('UPDATE tracking_active_gps_binding SET')) {
      rejectBindingUpdate = false;
      return Promise.reject(new Error('binding storage unavailable'));
    }
    return originalRun(sql, args);
  });

  jest.setSystemTime(3069000);
  await expect(resumeTracker()).rejects.toThrow('binding storage unavailable');

  expect(mockRows.get(sessionId)).toMatchObject({ state: 'paused' });
  expect(mockActiveBinding).toMatchObject({ session_id: sessionId, lifecycle_state: 'paused', generation: 1 });
  await discardTracker(); jest.useRealTimers();
});

it('rejects a malformed persisted segment timeline before storing GPS evidence', async () => {
  mockRows.set('malformed-session', {
    id: 'malformed-session', owner_id: 'account-test', planned_session_id: null, revision_id: null,
    prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 1000,
    ended_at_ms: null, checkpoint_at_ms: 2000,
    segments_json: JSON.stringify([
      { startedAtMs: 1000, endedAtMs: 3000 },
      { startedAtMs: 2000, endedAtMs: null },
    ]),
    distance_meters: 0, metric_version: 3, status_reason: 'gps', feedback_json: null,
  });
  mockActiveBinding = {
    binding_key: 'active_gps', owner_id: 'account-test', session_id: 'malformed-session',
    generation: 1, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 2000,
  };

  await expect(persistLocationBatch([
    { coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 2500 } as LocationObject,
  ], 4000)).rejects.toThrow('invalid_recording_timeline:overlapping_segment:1');

  expect(mockPointRows.some(point => point.session_id === 'malformed-session')).toBe(false);
  expect(mockRows.get('malformed-session')?.distance_meters).toBe(0);
});

it('quarantines ambiguous callbacks until the exact explicit anchor is observed', async () => {
  mockRows.set('quarantined-session', {
    id: 'quarantined-session', owner_id: 'account-test', planned_session_id: null, revision_id: null,
    prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 5000,
    ended_at_ms: null, checkpoint_at_ms: 5000, segments_json: JSON.stringify([{ startedAtMs: 5000, endedAtMs: null }]),
    distance_meters: 0, metric_version: 3, status_reason: 'gps', feedback_json: null,
  });
  mockActiveBinding = {
    binding_key: 'active_gps', owner_id: 'account-test', session_id: 'quarantined-session', generation: 4,
    lifecycle_state: 'recording', cutoff_ms: null, cutoff_token: null, pipeline_epoch: 2,
    pipeline_started_at_ms: 5000, trusted_anchor_timestamp_ms: 5000, trusted_anchor_latitude: 0,
    trusted_anchor_longitude: 0, trusted_anchor_accuracy_meters: 3, quarantine_state: 'pending', updated_at_ms: 5000,
  };
  const stale = await persistLocationBatch([{ coords: { latitude: 1, longitude: 1, accuracy: 3 }, timestamp: 5100 } as LocationObject], 5100);
  expect(stale).toEqual({ acceptedEvidence: false, rejectionReason: 'pipeline_quarantine' });
  const anchor = await persistLocationBatch([{ coords: { latitude: 0, longitude: 0, accuracy: 3 }, timestamp: 5000 } as LocationObject], 5200);
  expect(anchor.acceptedEvidence).toBe(true);
  expect(mockActiveBinding).toMatchObject({ generation: 4, quarantine_state: 'ready' });
});

it('atomically removes evidence proven to be after a recording cutoff', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6500000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6505000 } as LocationObject], 6505000);
  await persistLocationBatch([{ coords: { latitude: 0.0002, longitude: 0, accuracy: 3 }, timestamp: 6510000 } as LocationObject], 6510000);
  await setGpsRecordingCutoff(sessionId, 'account-test', 6507000);
  expect(mockPointRows.some(point => point.session_id === sessionId && Number(point.timestamp_ms) > 6507000)).toBe(false);
  expect(mockMetricEdges.some(edge => edge.session_id === sessionId && Number(edge.observation_timestamp_ms) > 6507000)).toBe(false);
  expect(mockRows.get(sessionId)?.distance_meters).toBeCloseTo(11.119, 2);
  await discardTracker(); jest.useRealTimers();
});

it('keeps a newer cutoff effective after an older cutoff attempt rolls back', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6600000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  mockDatabase.run.mockRejectedValueOnce(new Error('older cutoff failed'));
  await expect(setGpsRecordingCutoff(sessionId, 'account-test', 6605000)).rejects.toThrow('older cutoff failed');
  await setGpsRecordingCutoff(sessionId, 'account-test', 6607000);
  const rejected = await persistLocationBatch([{ coords: { latitude: 0.0002, longitude: 0, accuracy: 3 }, timestamp: 6608000 } as LocationObject], 6608000);
  expect(rejected).toEqual({ acceptedEvidence: false, rejectionReason: 'outside_recording_segment' });
  expect(mockActiveBinding).toMatchObject({ cutoff_ms: 6607000, lifecycle_state: 'draining' });
  await discardTracker(); jest.useRealTimers();
});

it('rolls back evidence deletion when cutoff reconciliation fails mid-transaction', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6700000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6705000 } as LocationObject], 6705000);
  const before = JSON.stringify({ points: mockPointRows, edges: mockMetricEdges, splits: mockSplits, row: mockRows.get(sessionId), binding: mockActiveBinding, gps: mockGpsStates.get(sessionId) });
  const implementation = mockDatabase.run.getMockImplementation()!;
  mockDatabase.run.mockImplementation(async (sql, args) => {
    if (sql.startsWith('DELETE FROM tracking_metric_edges')) throw new Error('injected reconciliation failure');
    return implementation(sql, args);
  });
  try {
    await expect(setGpsRecordingCutoff(sessionId, 'account-test', 6701000)).rejects.toThrow('injected reconciliation failure');
    expect(JSON.stringify({ points: mockPointRows, edges: mockMetricEdges, splits: mockSplits, row: mockRows.get(sessionId), binding: mockActiveBinding, gps: mockGpsStates.get(sessionId) })).toBe(before);
  } finally { mockDatabase.run.mockImplementation(implementation); }
  const later = await persistLocationBatch([{ coords: { latitude: 0.0002, longitude: 0, accuracy: 3 }, timestamp: 6710000 } as LocationObject], 6710000);
  expect(later.acceptedEvidence).toBe(true);
});

it('does not publish an orphaned runtime cutoff when overlapping cutoffs both fail', async () => {
  jest.useFakeTimers(); jest.setSystemTime(6800000);
  await startTracker({ mode: 'run' });
  const sessionId = String(mockActiveBinding?.session_id);
  mockDatabase.run.mockRejectedValueOnce(new Error('first failure')).mockRejectedValueOnce(new Error('second failure'));
  const results = await Promise.allSettled([
    setGpsRecordingCutoff(sessionId, 'account-test', 6801000),
    setGpsRecordingCutoff(sessionId, 'account-test', 6802000),
  ]);
  expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(mockActiveBinding?.cutoff_ms).toBeNull();
  const later = await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6805000 } as LocationObject], 6805000);
  expect(later.acceptedEvidence).toBe(true);
});

it('documents that a callback without a native generation token can match a replacement segment', async () => {
  mockRows.set('replacement-session', {
    id: 'replacement-session', owner_id: 'account-b', planned_session_id: null, revision_id: null,
    prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 5000,
    ended_at_ms: null, checkpoint_at_ms: 5000,
    segments_json: JSON.stringify([{ startedAtMs: 5000, endedAtMs: null }]),
    distance_meters: 0, metric_version: 3, status_reason: 'gps', feedback_json: null,
  });
  mockActiveBinding = {
    binding_key: 'active_gps', owner_id: 'account-b', session_id: 'replacement-session',
    generation: 2, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 5000,
  };

  // Expo's LocationObject contains no Torto session/generation identity. A late
  // callback whose observation time falls inside the replacement segment is
  // therefore indistinguishable from a genuine replacement-session callback.
  const result = await persistLocationBatch([
    { coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 5100 } as LocationObject,
  ], 5200);

  expect(result.acceptedEvidence).toBe(true);
  expect(mockPointRows.some(point => point.session_id === 'replacement-session' && point.timestamp_ms === 5100)).toBe(true);
});

it('accepts a delayed but ordered background batch for metric version 2', async () => {
  jest.useFakeTimers(); jest.setSystemTime(7000000); await startTracker({ mode: 'run' });
  jest.setSystemTime(7120000);
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 7010000 } as LocationObject], 7120000);
  const active = [...mockRows.values()].find(row => row.state === 'recording');
  expect(mockPointRows.some(point => point.session_id === active?.id && point.timestamp_ms === 7010000)).toBe(true);
  expect(Number(active?.distance_meters)).toBeGreaterThan(10);
  await discardTracker(); jest.useRealTimers();
});

it('rejects a delayed point captured during pause and never bridges resumed segments', async () => {
  const locationApi = jest.requireMock('expo-location') as { getCurrentPositionAsync: jest.Mock };
  jest.useFakeTimers(); jest.setSystemTime(8000000); await startTracker({ mode: 'run' });
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 8005000 } as LocationObject], 8005000);
  jest.setSystemTime(8010000); await pauseTracker();
  locationApi.getCurrentPositionAsync.mockResolvedValueOnce({ coords: { latitude: 0.001, longitude: 0, accuracy: 3 }, timestamp: 8020000 });
  jest.setSystemTime(8020000); await resumeTracker();
  await persistLocationBatch([
    { coords: { latitude: 0.0009, longitude: 0, accuracy: 3 }, timestamp: 8015000 } as LocationObject,
    { coords: { latitude: 0.001, longitude: 0, accuracy: 3 }, timestamp: 8020000 } as LocationObject,
    { coords: { latitude: 0.0011, longitude: 0, accuracy: 3 }, timestamp: 8025000 } as LocationObject,
  ], 8025000);
  const active = [...mockRows.values()].find(row => row.state === 'recording');
  expect(mockPointRows.some(point => point.session_id === active?.id && point.timestamp_ms === 8015000)).toBe(false);
  expect(Number(active?.distance_meters)).toBeGreaterThan(20);
  expect(Number(active?.distance_meters)).toBeLessThan(25);
  await discardTracker(); jest.useRealTimers();
});

it('commits a safely ordered late pre-pause observation with observation-time active milliseconds', async () => {
  jest.useFakeTimers(); jest.setSystemTime(8500000); await startTracker({ mode: 'run' });
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 8505000 } as LocationObject], 8505000);
  jest.setSystemTime(8510000); await pauseTracker();
  await persistLocationBatch([{ coords: { latitude: 0.0002, longitude: 0, accuracy: 3 }, timestamp: 8508000 } as LocationObject], 8520000);
  const session = [...mockRows.values()].find(row => row.state === 'paused');
  const lateEdge = mockMetricEdges.find(edge => edge.session_id === session?.id && edge.observation_timestamp_ms === 8508000);
  expect(lateEdge).toMatchObject({ active_elapsed_ms: 8000, segment: 0 });
  expect(Number(session?.distance_meters)).toBeGreaterThan(20);
  const unsafe = await persistLocationBatch([{ coords: { latitude: 0.00015, longitude: 0, accuracy: 3 }, timestamp: 8507000 } as LocationObject], 8521000);
  expect(unsafe).toEqual({ acceptedEvidence: false, rejectionReason: 'out_of_order' });
  await discardTracker(); jest.useRealTimers();
});

it('persists observation continuity across batches for uncertain slow walking', async () => {
  jest.useFakeTimers(); jest.setSystemTime(8600000); await startTracker({ mode: 'walk' });
  const baseLatitude = 0;
  for (let batch = 0; batch < 3; batch += 1) {
    const locations = Array.from({ length: 10 }, (_, offset) => {
      const index = batch * 10 + offset + 1;
      return { coords: { latitude: baseLatitude + (index * 4) / 6371000 * 180 / Math.PI, longitude: 0, accuracy: 20 }, timestamp: 8600000 + index * 2000 } as LocationObject;
    });
    await persistLocationBatch(locations, 8660000);
  }
  const session = [...mockRows.values()].find(row => row.state === 'recording');
  expect(Number(session?.distance_meters)).toBeGreaterThan(60);
  await discardTracker(); jest.useRealTimers();
});

it('uses a bounded last-point query with 5,000 historical points during long-session processing', async () => {
  jest.useFakeTimers(); jest.setSystemTime(8700000); await startTracker({ mode: 'run' });
  const session = [...mockRows.values()].find(row => row.state === 'recording')!;
  for (let index = 1; index <= 5000; index += 1) mockPointRows.push({ id: `${session.id}:seed:${index}`, session_id: session.id, timestamp_ms: 8700000 + index, latitude: index / 10000000, longitude: 0, accuracy_meters: 3, segment: 0 });
  mockDatabase.getAll.mockClear();
  await persistLocationBatch([{ coords: { latitude: 0.0006, longitude: 0, accuracy: 3 }, timestamp: 8706000 } as LocationObject], 8706000);
  expect(mockDatabase.getAll.mock.calls.some(([sql]) => String(sql).includes('FROM tracking_points') && String(sql).includes('LIMIT 1'))).toBe(true);
  expect(mockDatabase.getAll.mock.calls.some(([sql]) => String(sql).includes('FROM tracking_points') && !String(sql).includes('LIMIT'))).toBe(false);
  expect(mockPointRows.filter(point => point.session_id === session.id)).toHaveLength(5002); // readiness anchor + history + one new point
  await discardTracker(); jest.useRealTimers();
});

it('persists bounded background task diagnostics without ending the session', async () => {
  jest.useFakeTimers(); jest.setSystemTime(9000000); await startTracker({ mode: 'run' });
  const active = [...mockRows.values()].find(row => row.state === 'recording');
  await persistBackgroundTaskError('task_manager_error', 9001000);
  expect(mockRows.get(String(active?.id))?.state).toBe('recording');
  expect(mockGpsStates.get(String(active?.id))).toMatchObject({ task_error_code: 'task_manager_error', task_error_count: 1 });
  await discardTracker(); jest.useRealTimers();
});

it('persists an interpolated kilometre split and restores it without duplication', async () => {
  jest.useFakeTimers(); jest.setSystemTime(10000000); await startTracker({ mode: 'run' });
  const locations = Array.from({ length: 101 }, (_, index) => ({ coords: { latitude: ((index + 1) * 10) / 6371000 * 180 / Math.PI, longitude: 0, accuracy: 3 }, timestamp: 10000000 + (index + 1) * 1000 } as LocationObject));
  jest.setSystemTime(10101000); await persistLocationBatch(locations, 10101000); await persistLocationBatch(locations, 10101000);
  const snapshot = await syncTrackerFromPersistence();
  expect(snapshot?.completedKmSplits).toHaveLength(1);
  expect(snapshot?.completedKmSplits?.[0]).toMatchObject({ kilometre: 1, splitVersion: 1, metricVersion: 3 });
  expect(mockSplits).toHaveLength(1);
  await discardTracker(); jest.useRealTimers();
});

it('does not pause on screen lock and reconciles persisted distance when foreground returns', async () => {
  mockUpdatesStarted = false;
  const locationApi = jest.requireMock('expo-location') as { stopLocationUpdatesAsync: jest.Mock };
  locationApi.stopLocationUpdatesAsync.mockClear();
  jest.useFakeTimers(); jest.setSystemTime(4000000);
  await startTracker({ mode: 'run' });
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 4001000 } as LocationObject]);
  handleTrackerAppStateChange('background');
  expect([...mockRows.values()].some((row) => row.state === 'recording')).toBe(true);
  await handleTrackerAppStateChange('active'); await syncTrackerFromPersistence();
  expect((jest.requireMock('expo-location') as { stopLocationUpdatesAsync: jest.Mock }).stopLocationUpdatesAsync).not.toHaveBeenCalled();
  expect((await recoverTracker())?.session.distanceMeters).toBeGreaterThan(10);
  await discardTracker(); jest.useRealTimers();
});

it('requires background permission and explains why screen-lock recording is unavailable', async () => {
  mockUpdatesStarted = false;
  const location = jest.requireMock('expo-location') as { getBackgroundPermissionsAsync: jest.Mock; requestBackgroundPermissionsAsync: jest.Mock; startLocationUpdatesAsync: jest.Mock };
  location.startLocationUpdatesAsync.mockClear();
  location.getBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  location.requestBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await expect(startTracker({ mode: 'run' })).rejects.toThrow('Allow location all the time');
  expect((jest.requireMock('expo-location') as { startLocationUpdatesAsync: jest.Mock }).startLocationUpdatesAsync).not.toHaveBeenCalled();
});

it('marks a workout interrupted when permission loss is detected without claiming an earlier checkpoint', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(6000000);
  await startTracker({ mode: 'run' });
  jest.setSystemTime(6001000);
  await persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 6001000 } as LocationObject]);
  const location = jest.requireMock('expo-location') as { getBackgroundPermissionsAsync: jest.Mock };
  location.getBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await handleTrackerAppStateChange('active');
  const snapshot = await recoverTracker();
  expect(snapshot?.session.status).toBe('interrupted');
  expect(snapshot?.message).toContain('permission was removed');
  expect(snapshot?.message).toContain('detected the change');
  expect(snapshot?.message).not.toContain('last saved');
  expect(snapshot?.session.segments[0]?.endedAtMs).toBe(6001000);
});

it('flushes a queued GPS batch before finishing and saving the final distance', async () => {
  mockUpdatesStarted = false;
  jest.useFakeTimers(); jest.setSystemTime(7000000);
  await startTracker({ mode: 'run' });
  jest.setSystemTime(7001000);
  const pendingBatch = persistLocationBatch([{ coords: { latitude: 0.0001, longitude: 0, accuracy: 3 }, timestamp: 7001000 } as LocationObject]);
  const finishing = finishTracker();
  await pendingBatch;
  const result = await finishing;
  expect(result.session.status).toBe('saved');
  expect(result.session.distanceMeters).toBeGreaterThan(10);
  expect(mockPointRows.filter((point) => point.session_id === result.session.id)).toHaveLength(2);
});

it('recovers only the recorded portion after an interruption', async () => {
  mockPointRows.push({ id: 'interrupted:7000', session_id: 'interrupted', timestamp_ms: 7000, latitude: 0.0001, longitude: 0, accuracy_meters: 3, segment: 0 });
  mockRows.set('interrupted', { id: 'interrupted', owner_id: 'account-test', planned_session_id: 'session-3', revision_id: 'revision-1', prescription_json: '{}', mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 8000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: null }]), distance_meters: 42, status_reason: 'gps', feedback_json: null });
  const recovered = await recoverTracker();
  expect(recovered?.session.status).toBe('interrupted');
  expect(recovered?.session.segments).toEqual([{ startedAtMs: 1000, endedAtMs: 8000 }]);
  const saved = await finishTracker();
  expect(saved.session.distanceMeters).toBe(42);
  expect(saved.track.lastPoint?.timestampMs).toBe(7000);
  expect((await pendingWorkout('session-3'))?.distance_meters).toBe(42);
});

it('recovers the exact bound session instead of a newer unrelated row', async () => {
  mockRows.set('bound-session', { id: 'bound-session', owner_id: 'account-test', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 5000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: null }]), distance_meters: 25, metric_version: 3, status_reason: 'gps', feedback_json: null });
  mockRows.set('newer-unbound-session', { id: 'newer-unbound-session', owner_id: 'account-test', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 6000, ended_at_ms: null, checkpoint_at_ms: 9000, segments_json: JSON.stringify([{ startedAtMs: 6000, endedAtMs: null }]), distance_meters: 99, metric_version: 3, status_reason: 'gps', feedback_json: null });
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-test', session_id: 'bound-session', generation: 7, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 5000 };
  const recovered = await recoverTracker();
  expect(recovered?.session).toMatchObject({ id: 'bound-session', ownerId: 'account-test', status: 'interrupted', distanceMeters: 25 });
  expect(mockRows.get('newer-unbound-session')).toMatchObject({ state: 'recording', distance_meters: 99 });
  await discardTracker();
});

it('deterministically interrupts durable Resume intent left pending by process death', async () => {
  mockRows.set('pending-resume', { id: 'pending-resume', owner_id: 'account-test', planned_session_id: null, revision_id: null, prescription_json: null, mode: 'run', state: 'recording', started_at_ms: 1000, ended_at_ms: null, checkpoint_at_ms: 6000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: 5000 }, { startedAtMs: 6000, endedAtMs: null }]), distance_meters: 20, metric_version: 3, status_reason: 'gps', feedback_json: null });
  mockActiveBinding = { binding_key: 'active_gps', owner_id: 'account-test', session_id: 'pending-resume', generation: 2, lifecycle_state: 'recording', cutoff_ms: null, cutoff_token: null, pipeline_epoch: 2, pipeline_started_at_ms: 6000, trusted_anchor_timestamp_ms: 6000, trusted_anchor_latitude: 0, trusted_anchor_longitude: 0, trusted_anchor_accuracy_meters: 3, quarantine_state: 'pending', updated_at_ms: 6000 };
  const recovered = await recoverTracker();
  expect(recovered?.session).toMatchObject({ id: 'pending-resume', status: 'interrupted', ownerId: 'account-test' });
  expect(mockActiveBinding).toMatchObject({ session_id: 'pending-resume', generation: 2, lifecycle_state: 'interrupted', quarantine_state: 'pending' });
  await discardTracker();
});

it('allows retrying a failed finish without discarding the recording', async () => {
  await startTracker({ sessionId: 'session-4', revisionId: 'revision-1', prescription: '{}', mode: 'run', timerOnly: false });
  mockDatabase.run.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(finishTracker()).rejects.toThrow('Storage unavailable');
  const saved = await finishTracker();
  expect(saved.session.status).toBe('saved');
  expect((await pendingWorkout('session-4'))?.id).toBe(saved.session.id);
});
