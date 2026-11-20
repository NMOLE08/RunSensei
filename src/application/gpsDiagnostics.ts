import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import type { SqlDatabase } from '@/data/database';
import { averagePaceSecondsPerKm, GPS_FILTER } from '@/domain/tracking/metrics';
import { activeMillisecondsAt, type RecordingSegment } from '@/domain/tracking/session';
import { rollingPaceFromEdges, type MetricEdgeEvidence } from '@/domain/tracking/liveRunMetrics';
import { loadKmSplits, loadMetricEdges } from '@/data/trackingMetricsRepository';

const enabledKey = 'gps_diagnostics_enabled_v1';
export const GPS_DIAGNOSTIC_EVENT_CAPACITY = 4096;
export const GPS_DIAGNOSTIC_QUEUE_CAPACITY = 256;
const diagnosticSchemaVersion = 2;
let enabledCache: boolean | null = null;
let databasePromise: Promise<SqlDatabase> | null = null;
let workerRunning = false;
const pending: DiagnosticJob[] = [];
const droppedBySession = new Map<string, number>();
const storageFailuresBySession = new Set<string>();
const flushWaiters = new Set<() => void>();

export type AndroidLocationPrecision = 'precise' | 'approximate' | 'unknown';
export type GpsDiagnosticEvent = Readonly<{
  atMs: number; kind: 'location' | 'refresh' | 'permission' | 'pace'; sessionStartedAtMs?: number;
  observationTimestampMs?: number; processingTimestampMs?: number; deliveryIntervalMs?: number | null; processingDelayMs?: number | null;
  accuracyMeters?: number | null; speedMetersPerSecond?: number | null; headingDegrees?: number | null; hasSpeed?: boolean; hasHeading?: boolean; mocked?: boolean | null;
  accepted?: boolean; rejectionReason?: string | null; rawDisplacementMeters?: number | null; acceptanceThresholdMeters?: number | null; committedDistanceIncrementMeters?: number | null; cumulativeDistanceMeters?: number | null; gap?: boolean;
  refreshStatus?: string; refreshStage?: string | null; refreshErrorCode?: string | null; refreshDurationMs?: number | null; snapshotAgeMs?: number | null; gpsQualityState?: string;
  permissionPrecision?: AndroidLocationPrecision; rollingWindowStartTimestampMs?: number | null; rollingWindowEndTimestampMs?: number | null; rollingWindowElapsedMs?: number | null; rollingWindowDistanceMeters?: number | null; rollingPaceSecPerKm?: number | null; rollingPaceUnavailableReason?: string | null;
}>;

export type GpsDiagnosticSummary = {
  schemaVersion: 2; collectionStartedAtMs: number; collectionEndedAtMs: number; sessionStartedAtMs: number | null; firstObservationTimestampMs: number | null; lastObservationTimestampMs: number | null;
  receivedObservations: number; acceptedObservations: number; rejectedObservations: number; rejectionCounts: Record<string, number>; anchorOnlyObservations: number; committedMovementEdges: number; totalCommittedDistanceMeters: number; observationGapCount: number;
  accuracy: { count: number; sum: number; min: number | null; max: number | null }; deliveryDelay: { count: number; sumMs: number; minMs: number | null; maxMs: number | null };
  refreshAttempts: number; refreshSuccesses: number; refreshFailures: number; maximumSnapshotAgeMs: number; eventsRecorded: number; eventsEvicted: number; eventsDropped: number; nextSequence: number;
  permissionPrecision: AndroidLocationPrecision; startedLate: boolean; storageFailureObserved: boolean;
};

type DiagnosticJob = { ownerId: string; sessionId: string; event: GpsDiagnosticEvent };
type DiagnosticSessionRow = { summary_json: string };
const sessionKey = (ownerId: string, sessionId: string) => `${ownerId}\u0000${sessionId}`;

function emptySummary(event: GpsDiagnosticEvent): GpsDiagnosticSummary {
  return { schemaVersion: 2, collectionStartedAtMs: event.atMs, collectionEndedAtMs: event.atMs, sessionStartedAtMs: event.sessionStartedAtMs ?? null, firstObservationTimestampMs: null, lastObservationTimestampMs: null, receivedObservations: 0, acceptedObservations: 0, rejectedObservations: 0, rejectionCounts: {}, anchorOnlyObservations: 0, committedMovementEdges: 0, totalCommittedDistanceMeters: 0, observationGapCount: 0, accuracy: { count: 0, sum: 0, min: null, max: null }, deliveryDelay: { count: 0, sumMs: 0, minMs: null, maxMs: null }, refreshAttempts: 0, refreshSuccesses: 0, refreshFailures: 0, maximumSnapshotAgeMs: 0, eventsRecorded: 0, eventsEvicted: 0, eventsDropped: 0, nextSequence: 1, permissionPrecision: 'unknown', startedLate: false, storageFailureObserved: false };
}

export function reduceGpsDiagnosticSummary(previous: GpsDiagnosticSummary | null, event: GpsDiagnosticEvent, dropped = 0): GpsDiagnosticSummary {
  const value: GpsDiagnosticSummary = previous ? { ...previous, rejectionCounts: { ...previous.rejectionCounts }, accuracy: { ...previous.accuracy }, deliveryDelay: { ...previous.deliveryDelay } } : emptySummary(event);
  value.collectionEndedAtMs = Math.max(value.collectionEndedAtMs, event.atMs); value.eventsRecorded += 1; value.eventsDropped += dropped; value.nextSequence += 1;
  if (event.sessionStartedAtMs !== undefined) value.sessionStartedAtMs ??= event.sessionStartedAtMs;
  if (event.permissionPrecision) value.permissionPrecision = event.permissionPrecision;
  if (event.kind === 'location') {
    value.receivedObservations += 1; const observed = event.observationTimestampMs ?? null;
    if (observed !== null) { value.firstObservationTimestampMs ??= observed; value.lastObservationTimestampMs = Math.max(value.lastObservationTimestampMs ?? observed, observed); }
    if (event.accepted) { value.acceptedObservations += 1; if ((event.committedDistanceIncrementMeters ?? 0) > 0) value.committedMovementEdges += 1; else value.anchorOnlyObservations += 1; }
    else { value.rejectedObservations += 1; const reason = event.rejectionReason ?? 'unknown'; value.rejectionCounts[reason] = (value.rejectionCounts[reason] ?? 0) + 1; }
    value.totalCommittedDistanceMeters = Math.max(value.totalCommittedDistanceMeters, event.cumulativeDistanceMeters ?? 0); if (event.gap) value.observationGapCount += 1;
    if (event.accuracyMeters !== null && event.accuracyMeters !== undefined && Number.isFinite(event.accuracyMeters)) { const accuracy = event.accuracyMeters; value.accuracy.count += 1; value.accuracy.sum += accuracy; value.accuracy.min = Math.min(value.accuracy.min ?? accuracy, accuracy); value.accuracy.max = Math.max(value.accuracy.max ?? accuracy, accuracy); }
    if (event.processingDelayMs !== null && event.processingDelayMs !== undefined && Number.isFinite(event.processingDelayMs)) { const delay = event.processingDelayMs; value.deliveryDelay.count += 1; value.deliveryDelay.sumMs += delay; value.deliveryDelay.minMs = Math.min(value.deliveryDelay.minMs ?? delay, delay); value.deliveryDelay.maxMs = Math.max(value.deliveryDelay.maxMs ?? delay, delay); }
  }
  if (event.kind === 'refresh') { value.refreshAttempts += 1; if (event.refreshStatus === 'failed') value.refreshFailures += 1; else value.refreshSuccesses += 1; value.maximumSnapshotAgeMs = Math.max(value.maximumSnapshotAgeMs, event.snapshotAgeMs ?? 0); }
  value.startedLate = value.sessionStartedAtMs !== null && value.firstObservationTimestampMs !== null && value.firstObservationTimestampMs - value.sessionStartedAtMs > 5000;
  return value;
}

async function database(): Promise<SqlDatabase> { databasePromise ??= (async () => { const db = await openAppDatabase(); await migrate(db, new Date().toISOString()); return db; })(); return databasePromise; }
async function diagnosticsEnabled(): Promise<boolean> { if (enabledCache !== null) return enabledCache; const db = await database(); const value = await db.getFirst<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [enabledKey]); enabledCache = value?.value === 'true'; return enabledCache; }
export async function gpsDiagnosticsEnabled(): Promise<boolean> { return diagnosticsEnabled(); }
export async function setGpsDiagnosticsEnabled(enabled: boolean): Promise<void> { const db = await database(); await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [enabledKey, enabled ? 'true' : 'false']); enabledCache = enabled; }

async function persistJob(job: DiagnosticJob): Promise<void> {
  if (!await diagnosticsEnabled()) return;
  const db = await database(); const key = sessionKey(job.ownerId, job.sessionId); const dropped = droppedBySession.get(key) ?? 0;
  const operation = async (scoped: SqlDatabase) => {
    const row = await scoped.getFirst<DiagnosticSessionRow>('SELECT summary_json FROM tracking_gps_diagnostic_sessions WHERE owner_id = ? AND session_id = ?', [job.ownerId, job.sessionId]); let previous: GpsDiagnosticSummary | null = null;
    if (row) { try { previous = JSON.parse(row.summary_json) as GpsDiagnosticSummary; } catch { previous = null; } }
    const summary = reduceGpsDiagnosticSummary(previous, job.event, dropped); summary.storageFailureObserved ||= storageFailuresBySession.has(key); const sequence = summary.nextSequence - 1;
    if (sequence > GPS_DIAGNOSTIC_EVENT_CAPACITY) { await scoped.run('DELETE FROM tracking_gps_diagnostic_events WHERE owner_id = ? AND session_id = ? AND sequence <= ?', [job.ownerId, job.sessionId, sequence - GPS_DIAGNOSTIC_EVENT_CAPACITY]); summary.eventsEvicted = Math.max(summary.eventsEvicted, sequence - GPS_DIAGNOSTIC_EVENT_CAPACITY); }
    await scoped.run('INSERT INTO tracking_gps_diagnostic_events (owner_id, session_id, sequence, event_json, recorded_at_ms) VALUES (?, ?, ?, ?, ?)', [job.ownerId, job.sessionId, sequence, JSON.stringify(job.event), job.event.atMs]);
    await scoped.run('INSERT OR REPLACE INTO tracking_gps_diagnostic_sessions (owner_id, session_id, summary_json, updated_at_ms) VALUES (?, ?, ?, ?)', [job.ownerId, job.sessionId, JSON.stringify(summary), job.event.atMs]);
  };
  if (db.exclusiveTransaction) await db.exclusiveTransaction(operation); else await db.transaction(() => operation(db));
  const currentDropped = droppedBySession.get(key) ?? 0;
  if (currentDropped <= dropped) droppedBySession.delete(key); else droppedBySession.set(key, currentDropped - dropped);
  storageFailuresBySession.delete(key);
}

async function runWorker() {
  if (workerRunning) return; workerRunning = true;
  try { while (pending.length > 0) { const job = pending.shift()!; try { await persistJob(job); } catch { const key = sessionKey(job.ownerId, job.sessionId); droppedBySession.set(key, (droppedBySession.get(key) ?? 0) + 1); storageFailuresBySession.add(key); } } }
  finally { workerRunning = false; for (const resolve of flushWaiters) resolve(); flushWaiters.clear(); if (pending.length > 0) void runWorker(); }
}

/** Enqueues best-effort diagnostics without delaying GPS or cue work. */
export function recordGpsDiagnostic(ownerId: string, sessionId: string, event: GpsDiagnosticEvent): void { const key = sessionKey(ownerId, sessionId); if (pending.length >= GPS_DIAGNOSTIC_QUEUE_CAPACITY) { droppedBySession.set(key, (droppedBySession.get(key) ?? 0) + 1); return; } pending.push({ ownerId, sessionId, event }); void runWorker(); }
export async function flushGpsDiagnostics(timeoutMs = 1500): Promise<boolean> { if (!workerRunning && pending.length === 0) return true; return new Promise(resolve => { let settled = false; const done = () => { if (settled) return; settled = true; clearTimeout(timer); flushWaiters.delete(done); resolve(pending.length === 0 && !workerRunning); }; const timer = setTimeout(done, timeoutMs); flushWaiters.add(done); }); }

export async function readGpsDiagnostics(ownerId: string, sessionId: string): Promise<{ summary: GpsDiagnosticSummary | null; events: readonly GpsDiagnosticEvent[] }> {
  const db = await database(); const row = await db.getFirst<DiagnosticSessionRow>('SELECT summary_json FROM tracking_gps_diagnostic_sessions WHERE owner_id = ? AND session_id = ?', [ownerId, sessionId]); const rows = await db.getAll<{ event_json: string }>('SELECT event_json FROM tracking_gps_diagnostic_events WHERE owner_id = ? AND session_id = ? ORDER BY sequence', [ownerId, sessionId]); let summary: GpsDiagnosticSummary | null = null;
  if (row) { try { summary = JSON.parse(row.summary_json) as GpsDiagnosticSummary; } catch { summary = null; } }
  const events = rows.flatMap(item => { try { return [JSON.parse(item.event_json) as GpsDiagnosticEvent]; } catch { return []; } }); return { summary, events };
}

type SessionExportRow = { started_at_ms: number; ended_at_ms: number | null; checkpoint_at_ms: number; segments_json: string; distance_meters: number | null; metric_version: number };
export async function exportGpsDiagnostics(ownerId: string, sessionId: string, metricVersion: number): Promise<string> {
  const flushed = await flushGpsDiagnostics(); const db = await database(); const diagnostic = await readGpsDiagnostics(ownerId, sessionId); const session = await db.getFirst<SessionExportRow>('SELECT started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version FROM tracking_sessions WHERE owner_id = ? AND id = ?', [ownerId, sessionId]); if (!session) throw new Error('diagnostic_session_not_found');
  const segments = JSON.parse(session.segments_json) as RecordingSegment[]; const evaluationTime = session.ended_at_ms ?? session.checkpoint_at_ms; const durationMs = activeMillisecondsAt(segments, evaluationTime); const splits = await loadKmSplits(db, ownerId, sessionId); const edges = await loadMetricEdges(db, ownerId, sessionId); const last = edges.at(-1); const currentSegment = last?.segment; const windowEdges = last ? edges.filter(edge => edge.segment === currentSegment && last.observationTimestampMs - edge.observationTimestampMs <= GPS_FILTER.smoothingWindowMs) : []; const firstWindow = windowEdges[0] ?? null; const rollingPace = rollingPaceFromEdges(windowEdges, evaluationTime, 'recording', currentSegment);
  const diagnosticKey = sessionKey(ownerId, sessionId); const pendingDropped = droppedBySession.get(diagnosticKey) ?? 0; const pendingStorageFailure = storageFailuresBySession.has(diagnosticKey); const summary = diagnostic.summary ? { ...diagnostic.summary, eventsDropped: diagnostic.summary.eventsDropped + pendingDropped, storageFailureObserved: diagnostic.summary.storageFailureObserved || pendingStorageFailure } : null; const complete = flushed && pendingDropped === 0 && !pendingStorageFailure && !!summary && !summary.startedLate && !summary.storageFailureObserved && summary.eventsDropped === 0 && summary.eventsEvicted === 0;
  const payload = JSON.stringify({ format: 'torto-gps-diagnostics', diagnosticSchemaVersion, application: { name: Constants.expoConfig?.name ?? 'Torto', version: Constants.expoConfig?.version ?? 'unknown', package: Constants.expoConfig?.android?.package ?? 'com.aisensei.app' }, exportedAt: new Date().toISOString(), safeSessionId: sessionId, metricVersion: session.metric_version ?? metricVersion, permissionPrecision: summary?.permissionPrecision ?? 'unknown', recording: { activeDurationMs: durationMs, distanceMeters: session.distance_meters, averagePaceSecPerKm: averagePaceSecondsPerKm(session.distance_meters, durationMs / 1000), completedKmSplits: splits }, summary, detailedEvents: diagnostic.events, rollingPaceEvidence: { startTimestampMs: firstWindow?.observationTimestampMs ?? null, endTimestampMs: last?.observationTimestampMs ?? null, elapsedMs: firstWindow && last ? last.observationTimestampMs - firstWindow.observationTimestampMs : null, distanceMeters: firstWindow && last ? last.cumulativeDistanceMeters - firstWindow.cumulativeDistanceMeters : null, paceSecPerKm: rollingPace }, collection: { flushCompleted: flushed, retainedEventCapacity: GPS_DIAGNOSTIC_EVENT_CAPACITY, retainedEvents: diagnostic.events.length, pendingDroppedEvents: pendingDropped, complete, limitations: ['Ordinary diagnostics exclude route coordinates; exact trajectory replay is unavailable.'] } }, null, 2);
  const uri = `${FileSystem.cacheDirectory}torto-gps-diagnostics-${sessionId}.json`; await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 }); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export Torto GPS diagnostics' }); return uri;
}

export function rollingDiagnosticEvent(edges: readonly MetricEdgeEvidence[], observedAtMs: number, pace: number | null, unavailableReason: string | null): GpsDiagnosticEvent {
  const last = edges.at(-1) ?? null; const first = edges[0] ?? null;
  return { atMs: observedAtMs, kind: 'pace', rollingWindowStartTimestampMs: first?.observationTimestampMs ?? null, rollingWindowEndTimestampMs: last?.observationTimestampMs ?? null, rollingWindowElapsedMs: first && last ? last.observationTimestampMs - first.observationTimestampMs : null, rollingWindowDistanceMeters: first && last ? last.cumulativeDistanceMeters - first.cumulativeDistanceMeters : null, rollingPaceSecPerKm: pace, rollingPaceUnavailableReason: unavailableReason };
}
