import type { SqlDatabase } from './database';
import type { CompletedKmSplit, GpsQualityState, MetricEdgeEvidence, PersistedGpsQuality } from '@/domain/tracking/liveRunMetrics';
import { GPS_FILTER } from '@/domain/tracking/metrics';

type EdgeRow = {
  session_id: string;
  observation_timestamp_ms: number;
  processing_timestamp_ms: number;
  segment: number;
  distance_increment_meters: number;
  cumulative_distance_meters: number;
  active_elapsed_ms: number;
  accuracy_meters: number;
  edge_kind: MetricEdgeEvidence['kind'];
  metric_version: 2 | 3;
};
type SplitRow = {
  id: string;
  kilometre: number;
  crossing_active_ms: number;
  duration_ms: number;
  pace_sec_per_km: number;
  gps_coverage: CompletedKmSplit['gpsCoverage'];
  metric_version: 2 | 3;
};
export type GpsStateRow = {
  session_id: string;
  owner_id: string;
  last_received_timestamp_ms: number | null;
  last_accepted_timestamp_ms: number | null;
  last_valid_observation_timestamp_ms?: number | null;
  accuracy_meters: number | null;
  quality_state: GpsQualityState;
  reason_codes_json: string;
  task_error_code: string | null;
  task_error_count: number;
  accept_until_ms: number | null;
  updated_at_ms: number;
};

export type ActiveGpsBindingState = 'recording' | 'draining' | 'paused' | 'finishing' | 'interrupted';
export type ActiveGpsBindingRow = {
  binding_key: 'active_gps';
  owner_id: string;
  session_id: string;
  generation: number;
  lifecycle_state: ActiveGpsBindingState;
  cutoff_ms: number | null;
  cutoff_token: string | null;
  pipeline_epoch: number;
  pipeline_started_at_ms: number | null;
  trusted_anchor_timestamp_ms: number | null;
  trusted_anchor_latitude: number | null;
  trusted_anchor_longitude: number | null;
  trusted_anchor_accuracy_meters: number | null;
  quarantine_state: 'pending' | 'ready' | 'blocked';
  /** Durable acknowledgement of the native pipeline after a Resume intent. */
  resume_state: 'confirmed' | 'native_start_pending' | 'recovery_required';
  /** Exact pre-resume distance, used only to compensate V1 sessions safely. */
  resume_distance_meters: number | null;
  account_transition_pending: number;
  updated_at_ms: number;
};

export type NewActiveGpsBinding = Omit<ActiveGpsBindingRow, 'binding_key' | 'cutoff_token' | 'pipeline_epoch' | 'pipeline_started_at_ms' | 'trusted_anchor_timestamp_ms' | 'trusted_anchor_latitude' | 'trusted_anchor_longitude' | 'trusted_anchor_accuracy_meters' | 'quarantine_state' | 'resume_state' | 'resume_distance_meters' | 'account_transition_pending'> & Partial<Pick<ActiveGpsBindingRow, 'cutoff_token' | 'pipeline_epoch' | 'pipeline_started_at_ms' | 'trusted_anchor_timestamp_ms' | 'trusted_anchor_latitude' | 'trusted_anchor_longitude' | 'trusted_anchor_accuracy_meters' | 'quarantine_state' | 'resume_state' | 'resume_distance_meters' | 'account_transition_pending'>>;

export async function loadActiveGpsBinding(database: SqlDatabase): Promise<ActiveGpsBindingRow | null> {
  const row = await database.getFirst<ActiveGpsBindingRow>("SELECT binding_key, owner_id, session_id, generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms FROM tracking_active_gps_binding WHERE binding_key = 'active_gps'");
  if (!row) return null;
  // Migration 24 supplies these defaults in SQLite. Keeping the read boundary
  // defensive also makes recovery deterministic for pre-migration test doubles.
  return {
    ...row,
    cutoff_token: row.cutoff_token ?? null,
    pipeline_epoch: row.pipeline_epoch ?? 1,
    pipeline_started_at_ms: row.pipeline_started_at_ms ?? null,
    trusted_anchor_timestamp_ms: row.trusted_anchor_timestamp_ms ?? null,
    trusted_anchor_latitude: row.trusted_anchor_latitude ?? null,
    trusted_anchor_longitude: row.trusted_anchor_longitude ?? null,
    trusted_anchor_accuracy_meters: row.trusted_anchor_accuracy_meters ?? null,
    quarantine_state: row.quarantine_state ?? 'ready',
    resume_state: row.resume_state ?? 'confirmed',
    resume_distance_meters: row.resume_distance_meters ?? null,
    account_transition_pending: row.account_transition_pending ?? 0,
  };
}

export async function acquireActiveGpsBinding(database: SqlDatabase, input: NewActiveGpsBinding): Promise<ActiveGpsBindingRow> {
  const normalized: ActiveGpsBindingRow = { binding_key: 'active_gps', cutoff_token: null, pipeline_epoch: 1, pipeline_started_at_ms: null, trusted_anchor_timestamp_ms: null, trusted_anchor_latitude: null, trusted_anchor_longitude: null, trusted_anchor_accuracy_meters: null, quarantine_state: 'ready', resume_state: 'confirmed', resume_distance_meters: null, account_transition_pending: 0, ...input };
  const inserted = await database.run("INSERT INTO tracking_active_gps_binding (binding_key, owner_id, session_id, generation, lifecycle_state, cutoff_ms, cutoff_token, pipeline_epoch, pipeline_started_at_ms, trusted_anchor_timestamp_ms, trusted_anchor_latitude, trusted_anchor_longitude, trusted_anchor_accuracy_meters, quarantine_state, resume_state, resume_distance_meters, account_transition_pending, updated_at_ms) VALUES ('active_gps', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(binding_key) DO NOTHING", [normalized.owner_id, normalized.session_id, normalized.generation, normalized.lifecycle_state, normalized.cutoff_ms, normalized.cutoff_token, normalized.pipeline_epoch, normalized.pipeline_started_at_ms, normalized.trusted_anchor_timestamp_ms, normalized.trusted_anchor_latitude, normalized.trusted_anchor_longitude, normalized.trusted_anchor_accuracy_meters, normalized.quarantine_state, normalized.resume_state, normalized.resume_distance_meters, normalized.account_transition_pending, normalized.updated_at_ms]);
  if (inserted.changes === 0) {
    const existing = await loadActiveGpsBinding(database);
    throw new Error(existing ? `active_gps_session_exists:${existing.owner_id}:${existing.session_id}` : 'active_gps_binding_conflict');
  }
  return normalized;
}

export async function updateActiveGpsBinding(
  database: SqlDatabase,
  expected: ActiveGpsBindingRow,
  next: Pick<ActiveGpsBindingRow, 'generation' | 'lifecycle_state' | 'cutoff_ms' | 'updated_at_ms'> & Partial<Pick<ActiveGpsBindingRow, 'cutoff_token' | 'pipeline_epoch' | 'pipeline_started_at_ms' | 'trusted_anchor_timestamp_ms' | 'trusted_anchor_latitude' | 'trusted_anchor_longitude' | 'trusted_anchor_accuracy_meters' | 'quarantine_state' | 'resume_state' | 'resume_distance_meters' | 'account_transition_pending'>>,
): Promise<ActiveGpsBindingRow> {
  const normalized: ActiveGpsBindingRow = { ...expected, ...next };
  const updated = await database.run("UPDATE tracking_active_gps_binding SET generation = ?, lifecycle_state = ?, cutoff_ms = ?, cutoff_token = ?, pipeline_epoch = ?, pipeline_started_at_ms = ?, trusted_anchor_timestamp_ms = ?, trusted_anchor_latitude = ?, trusted_anchor_longitude = ?, trusted_anchor_accuracy_meters = ?, quarantine_state = ?, resume_state = ?, resume_distance_meters = ?, account_transition_pending = ?, updated_at_ms = ? WHERE binding_key = 'active_gps' AND owner_id = ? AND session_id = ? AND generation = ?", [normalized.generation, normalized.lifecycle_state, normalized.cutoff_ms, normalized.cutoff_token, normalized.pipeline_epoch, normalized.pipeline_started_at_ms, normalized.trusted_anchor_timestamp_ms, normalized.trusted_anchor_latitude, normalized.trusted_anchor_longitude, normalized.trusted_anchor_accuracy_meters, normalized.quarantine_state, normalized.resume_state, normalized.resume_distance_meters, normalized.account_transition_pending, normalized.updated_at_ms, expected.owner_id, expected.session_id, expected.generation]);
  if (updated.changes === 0) throw new Error('stale_active_gps_binding');
  return normalized;
}

export async function clearActiveGpsBinding(database: SqlDatabase, expected: Pick<ActiveGpsBindingRow, 'owner_id' | 'session_id' | 'generation'>): Promise<void> {
  const removed = await database.run("DELETE FROM tracking_active_gps_binding WHERE binding_key = 'active_gps' AND owner_id = ? AND session_id = ? AND generation = ?", [expected.owner_id, expected.session_id, expected.generation]);
  if (removed.changes === 0) throw new Error('stale_active_gps_binding');
}

export async function loadMetricEdges(database: SqlDatabase, ownerId: string, sessionId: string): Promise<MetricEdgeEvidence[]> {
  const rows = await database.getAll<EdgeRow>('SELECT session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? ORDER BY observation_timestamp_ms', [ownerId, sessionId]);
  return rows.map(row => ({ sessionId: row.session_id, observationTimestampMs: row.observation_timestamp_ms, processingTimestampMs: row.processing_timestamp_ms, segment: row.segment, distanceIncrementMeters: row.distance_increment_meters, cumulativeDistanceMeters: row.cumulative_distance_meters, activeElapsedMs: row.active_elapsed_ms, accuracyMeters: row.accuracy_meters, kind: row.edge_kind, metricVersion: row.metric_version }));
}

export async function loadKmSplits(database: SqlDatabase, ownerId: string, sessionId: string): Promise<CompletedKmSplit[]> {
  const rows = await database.getAll<SplitRow>('SELECT id, kilometre, crossing_active_ms, duration_ms, pace_sec_per_km, gps_coverage, metric_version FROM tracking_km_splits WHERE owner_id = ? AND session_id = ? ORDER BY kilometre', [ownerId, sessionId]);
  return rows.map(row => ({ id: row.id, kilometre: row.kilometre, crossingActiveMs: row.crossing_active_ms, durationMs: row.duration_ms, paceSecPerKm: row.pace_sec_per_km, gpsCoverage: row.gps_coverage, metricVersion: row.metric_version, splitVersion: 1 }));
}

export async function loadGpsState(database: SqlDatabase, ownerId: string, sessionId: string): Promise<GpsStateRow | null> {
  return database.getFirst<GpsStateRow>('SELECT * FROM tracking_gps_state WHERE session_id = ? AND owner_id = ?', [sessionId, ownerId]);
}

export function qualityFromRow(row: GpsStateRow | null, timerOnly: boolean): PersistedGpsQuality {
  if (timerOnly) return { state: 'unavailable', reasonCodes: ['timer_only'], lastReceivedTimestampMs: null, lastAcceptedTimestampMs: null, accuracyMeters: null };
  if (!row) return { state: 'acquiring', reasonCodes: ['awaiting_first_fix'], lastReceivedTimestampMs: null, lastAcceptedTimestampMs: null, accuracyMeters: null };
  let reasonCodes: string[] = [];
  try { const parsed = JSON.parse(row.reason_codes_json); if (Array.isArray(parsed)) reasonCodes = parsed.filter(value => typeof value === 'string'); } catch { reasonCodes = ['invalid_persisted_quality']; }
  return { state: row.quality_state, reasonCodes, lastReceivedTimestampMs: row.last_received_timestamp_ms, lastAcceptedTimestampMs: row.last_accepted_timestamp_ms, accuracyMeters: row.accuracy_meters };
}

export async function saveGpsState(database: SqlDatabase, row: GpsStateRow): Promise<void> {
  await database.run('INSERT INTO tracking_gps_state (session_id, owner_id, last_received_timestamp_ms, last_accepted_timestamp_ms, last_valid_observation_timestamp_ms, accuracy_meters, quality_state, reason_codes_json, task_error_code, task_error_count, accept_until_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET last_received_timestamp_ms = excluded.last_received_timestamp_ms, last_accepted_timestamp_ms = excluded.last_accepted_timestamp_ms, last_valid_observation_timestamp_ms = excluded.last_valid_observation_timestamp_ms, accuracy_meters = excluded.accuracy_meters, quality_state = excluded.quality_state, reason_codes_json = excluded.reason_codes_json, task_error_code = excluded.task_error_code, task_error_count = excluded.task_error_count, accept_until_ms = excluded.accept_until_ms, updated_at_ms = excluded.updated_at_ms WHERE tracking_gps_state.owner_id = excluded.owner_id', [row.session_id, row.owner_id, row.last_received_timestamp_ms, row.last_accepted_timestamp_ms, row.last_valid_observation_timestamp_ms ?? row.last_accepted_timestamp_ms, row.accuracy_meters, row.quality_state, row.reason_codes_json, row.task_error_code, row.task_error_count, row.accept_until_ms, row.updated_at_ms]);
}

/** Bounded live evidence: current partial kilometre plus the rolling-pace window. */
export async function loadLiveMetricEdges(database: SqlDatabase, ownerId: string, sessionId: string): Promise<MetricEdgeEvidence[]> {
  const latestSplit = await database.getFirst<{ crossing_active_ms: number }>('SELECT crossing_active_ms FROM tracking_km_splits WHERE owner_id = ? AND session_id = ? ORDER BY kilometre DESC LIMIT 1', [ownerId, sessionId]);
  const last = await database.getFirst<{ observation_timestamp_ms: number; segment: number }>('SELECT observation_timestamp_ms, segment FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? ORDER BY observation_timestamp_ms DESC LIMIT 1', [ownerId, sessionId]);
  // Keep both the current partial-kilometre evidence and the short current
  // segment window used for rolling pace. The latter intentionally survives a
  // kilometre crossing; replaying the complete route is unnecessary.
  const rollingWindowStart = (last?.observation_timestamp_ms ?? 0) - GPS_FILTER.smoothingWindowMs;
  const rows = await database.getAll<EdgeRow>('SELECT session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? AND (active_elapsed_ms >= ? OR (segment = ? AND observation_timestamp_ms >= ?)) ORDER BY observation_timestamp_ms', [ownerId, sessionId, latestSplit?.crossing_active_ms ?? 0, last?.segment ?? -1, rollingWindowStart]);
  return rows.map(row => ({ sessionId: row.session_id, observationTimestampMs: row.observation_timestamp_ms, processingTimestampMs: row.processing_timestamp_ms, segment: row.segment, distanceIncrementMeters: row.distance_increment_meters, cumulativeDistanceMeters: row.cumulative_distance_meters, activeElapsedMs: row.active_elapsed_ms, accuracyMeters: row.accuracy_meters, kind: row.edge_kind, metricVersion: row.metric_version }));
}
