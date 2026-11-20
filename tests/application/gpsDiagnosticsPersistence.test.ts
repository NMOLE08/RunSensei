import type { SqlDatabase, SqlResult, SqlValue } from '@/data/database';
import { exportGpsDiagnostics, flushGpsDiagnostics, readGpsDiagnostics, recordGpsDiagnostic } from '@/application/gpsDiagnostics';

type StoredEvent = { ownerId: string; sessionId: string; sequence: number; eventJson: string; recordedAtMs: number };
const mockSummaries = new Map<string, string>();
const mockEvents: StoredEvent[] = [];
let mockFailNextEventWrite = false;
let mockReleaseSlowWrite: (() => void) | null = null;
let mockWrittenPayload = '';
const key = (ownerId: unknown, sessionId: unknown) => `${String(ownerId)}:${String(sessionId)}`;

const mockDatabase: SqlDatabase = {
  async run(sql: string, params: SqlValue[] = []): Promise<SqlResult> {
    if (sql.startsWith('INSERT INTO tracking_gps_diagnostic_events')) {
      if (mockReleaseSlowWrite !== null) await new Promise<void>(resolve => { const release = mockReleaseSlowWrite; mockReleaseSlowWrite = () => { release?.(); resolve(); }; });
      if (mockFailNextEventWrite) { mockFailNextEventWrite = false; throw new Error('diagnostic storage unavailable'); }
      mockEvents.push({ ownerId: String(params[0]), sessionId: String(params[1]), sequence: Number(params[2]), eventJson: String(params[3]), recordedAtMs: Number(params[4]) });
    } else if (sql.startsWith('INSERT OR REPLACE INTO tracking_gps_diagnostic_sessions')) {
      mockSummaries.set(key(params[0], params[1]), String(params[2]));
    } else if (sql.startsWith('DELETE FROM tracking_gps_diagnostic_events')) {
      const [ownerId, sessionId, through] = params;
      for (let index = mockEvents.length - 1; index >= 0; index -= 1) if (mockEvents[index]!.ownerId === ownerId && mockEvents[index]!.sessionId === sessionId && mockEvents[index]!.sequence <= Number(through)) mockEvents.splice(index, 1);
    }
    return { changes: 1, lastInsertRowId: 0 };
  },
  async getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    if (sql.includes('FROM app_settings')) return { value: 'true' } as T;
    if (sql.includes('FROM tracking_gps_diagnostic_sessions')) {
      const summary = mockSummaries.get(key(params[0], params[1]));
      return summary ? { summary_json: summary } as T : null;
    }
    if (sql.includes('FROM tracking_sessions')) return { started_at_ms: 1000, ended_at_ms: 61000, checkpoint_at_ms: 61000, segments_json: JSON.stringify([{ startedAtMs: 1000, endedAtMs: 61000 }]), distance_meters: 200, metric_version: 3 } as T;
    return null;
  },
  async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    if (sql.includes('FROM tracking_gps_diagnostic_events')) return mockEvents.filter(event => event.ownerId === params[0] && event.sessionId === params[1]).sort((a, b) => a.sequence - b.sequence).map(event => ({ event_json: event.eventJson })) as T[];
    return [];
  },
  async transaction<T>(operation: () => Promise<T>): Promise<T> { return operation(); },
  async exclusiveTransaction<T>(operation: (database: SqlDatabase) => Promise<T>): Promise<T> { return operation(mockDatabase); },
};

jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn(async () => mockDatabase) }));
jest.mock('@/data/migrations', () => ({ migrate: jest.fn(async () => undefined) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { name: 'Torto', version: 'test', android: { package: 'com.aisensei.app' } } } }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', EncodingType: { UTF8: 'utf8' }, writeAsStringAsync: jest.fn(async (_uri: string, payload: string) => { mockWrittenPayload = payload; }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn(async () => undefined) }));

describe('GPS diagnostic persistence isolation', () => {
  it('keeps sessions account-scoped and exports whole-session evidence without account identity', async () => {
    recordGpsDiagnostic('account-a', 'session-a', { atMs: 1000, kind: 'location', observationTimestampMs: 900, processingTimestampMs: 1000, accepted: true, accuracyMeters: 4, committedDistanceIncrementMeters: 5, cumulativeDistanceMeters: 5 });
    recordGpsDiagnostic('account-b', 'session-b', { atMs: 1100, kind: 'location', observationTimestampMs: 1000, processingTimestampMs: 1100, accepted: false, rejectionReason: 'jitter', accuracyMeters: 7, cumulativeDistanceMeters: 0 });
    expect(await flushGpsDiagnostics()).toBe(true);
    await expect(readGpsDiagnostics('account-a', 'session-a')).resolves.toMatchObject({ summary: { receivedObservations: 1, acceptedObservations: 1 }, events: [{ accepted: true }] });
    await expect(readGpsDiagnostics('account-a', 'session-b')).resolves.toEqual({ summary: null, events: [] });

    await exportGpsDiagnostics('account-a', 'session-a', 3);
    const payload = JSON.parse(mockWrittenPayload) as Record<string, unknown>;
    expect(payload).toMatchObject({ format: 'torto-gps-diagnostics', diagnosticSchemaVersion: 2, metricVersion: 3, permissionPrecision: 'unknown', application: { package: 'com.aisensei.app' }, collection: { flushCompleted: true, complete: true } });
    expect(mockWrittenPayload).not.toContain('account-a');
  });

  it('does not throw into workout code when storage fails and reports dropped evidence after recovery', async () => {
    mockFailNextEventWrite = true;
    expect(() => recordGpsDiagnostic('account-a', 'session-failure', { atMs: 2000, kind: 'refresh', refreshStatus: 'failed', refreshStage: 'evidence_read' })).not.toThrow();
    expect(await flushGpsDiagnostics()).toBe(true);
    recordGpsDiagnostic('account-a', 'session-failure', { atMs: 2100, kind: 'refresh', refreshStatus: 'current' });
    expect(await flushGpsDiagnostics()).toBe(true);
    await expect(readGpsDiagnostics('account-a', 'session-failure')).resolves.toMatchObject({ summary: { refreshAttempts: 1, eventsDropped: 1, storageFailureObserved: true } });
  });

  it('bounds export waiting when diagnostic storage is slow', async () => {
    mockReleaseSlowWrite = () => undefined;
    recordGpsDiagnostic('account-a', 'session-slow', { atMs: 3000, kind: 'pace', rollingPaceSecPerKm: 360 });
    expect(await flushGpsDiagnostics(1)).toBe(false);
    mockReleaseSlowWrite?.();
    mockReleaseSlowWrite = null;
    expect(await flushGpsDiagnostics()).toBe(true);
  });
});
