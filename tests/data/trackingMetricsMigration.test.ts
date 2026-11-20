import { migrate, migrations } from '@/data/migrations';
import { acquireActiveGpsBinding, clearActiveGpsBinding, loadActiveGpsBinding, loadGpsState, loadKmSplits, loadMetricEdges, saveGpsState, updateActiveGpsBinding } from '@/data/trackingMetricsRepository';
import { MemoryDatabase } from '../support/memoryDatabase';

describe('tracking metrics migration 21', () => {
  it('is additive and creates the versioned evidence tables', async () => {
    const database = new MemoryDatabase();
    await migrate(database, '2026-11-11T00:00:00.000Z');
    expect(migrations.at(-1)?.version).toBe(27);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_metric_edges'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_km_splits'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_gps_state'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('last_valid_observation_timestamp_ms'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_active_gps_binding'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('ADD COLUMN cutoff_token'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('ADD COLUMN pipeline_epoch'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('ADD COLUMN quarantine_state'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('ADD COLUMN resume_state'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('ADD COLUMN account_transition_pending'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_gps_diagnostic_sessions'))).toBe(true);
    expect(database.statements.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS tracking_gps_diagnostic_events'))).toBe(true);
  });

  it('keeps one generation-guarded active GPS binding', async () => {
    let binding: Record<string, string | number | null> | null = null;
    const database = {
      run: jest.fn(async (sql: string, params: (string | number | null)[] = []) => {
        if (sql.startsWith('INSERT INTO tracking_active_gps_binding')) {
          if (binding) return { changes: 0, lastInsertRowId: 0 };
          binding = { binding_key: 'active_gps', owner_id: params[0], session_id: params[1], generation: params[2], lifecycle_state: params[3], cutoff_ms: params[4], cutoff_token: params[5], pipeline_epoch: params[6], pipeline_started_at_ms: params[7], trusted_anchor_timestamp_ms: params[8], trusted_anchor_latitude: params[9], trusted_anchor_longitude: params[10], trusted_anchor_accuracy_meters: params[11], quarantine_state: params[12], resume_state: params[13], resume_distance_meters: params[14], account_transition_pending: params[15], updated_at_ms: params[16] };
          return { changes: 1, lastInsertRowId: 1 };
        }
        if (sql.startsWith('UPDATE tracking_active_gps_binding')) {
          if (!binding || binding.owner_id !== params[15] || binding.session_id !== params[16] || binding.generation !== params[17]) return { changes: 0, lastInsertRowId: 0 };
          Object.assign(binding, { generation: params[0], lifecycle_state: params[1], cutoff_ms: params[2], cutoff_token: params[3], pipeline_epoch: params[4], pipeline_started_at_ms: params[5], trusted_anchor_timestamp_ms: params[6], trusted_anchor_latitude: params[7], trusted_anchor_longitude: params[8], trusted_anchor_accuracy_meters: params[9], quarantine_state: params[10], resume_state: params[11], resume_distance_meters: params[12], account_transition_pending: params[13], updated_at_ms: params[14] }); return { changes: 1, lastInsertRowId: 0 };
        }
        if (sql.startsWith('DELETE FROM tracking_active_gps_binding')) {
          if (!binding || binding.owner_id !== params[0] || binding.session_id !== params[1] || binding.generation !== params[2]) return { changes: 0, lastInsertRowId: 0 };
          binding = null; return { changes: 1, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      }),
      getFirst: jest.fn(async () => binding),
      getAll: jest.fn(async () => []), transaction: jest.fn(),
    } as unknown as MemoryDatabase;
    const acquired = await acquireActiveGpsBinding(database, { owner_id: 'account-a', session_id: 'session-a', generation: 1, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 1000 });
    await expect(acquireActiveGpsBinding(database, { owner_id: 'account-b', session_id: 'session-b', generation: 1, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 1001 })).rejects.toThrow('active_gps_session_exists:account-a:session-a');
    const paused = await updateActiveGpsBinding(database, acquired, { generation: 1, lifecycle_state: 'paused', cutoff_ms: 2000, updated_at_ms: 2000 });
    expect(await loadActiveGpsBinding(database)).toMatchObject({ lifecycle_state: 'paused', cutoff_ms: 2000 });
    await expect(updateActiveGpsBinding(database, { ...paused, generation: 0 }, { generation: 1, lifecycle_state: 'recording', cutoff_ms: null, updated_at_ms: 3000 })).rejects.toThrow('stale_active_gps_binding');
    await clearActiveGpsBinding(database, paused);
    expect(await loadActiveGpsBinding(database)).toBeNull();
  });

  it('keeps quality state account-scoped', async () => {
    const database = new MemoryDatabase();
    await saveGpsState(database, { session_id: 'session-a', owner_id: 'account-a', last_received_timestamp_ms: 1000, last_accepted_timestamp_ms: 1000, accuracy_meters: 4, quality_state: 'reliable', reason_codes_json: '[]', task_error_code: null, task_error_count: 0, accept_until_ms: null, updated_at_ms: 1000 });
    expect(await loadGpsState(database, 'account-a', 'session-a')).toMatchObject({ quality_state: 'reliable' });
    expect(await loadGpsState(database, 'account-b', 'session-a')).toBeNull();
  });

  it('loads accepted edges and splits only for their owner', async () => {
    const database = new MemoryDatabase();
    await database.run('INSERT INTO tracking_metric_edges (id, owner_id, session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['edge', 'account-a', 'session', 1000, 2000, 0, 10, 10, 1000, 3, 'movement', 2]);
    await database.run('INSERT INTO tracking_km_splits (id, owner_id, session_id, kilometre, crossing_active_ms, duration_ms, pace_sec_per_km, gps_coverage, metric_version, split_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['split', 'account-a', 'session', 1, 300000, 300000, 300, 'continuous', 2, 1]);
    expect(await loadMetricEdges(database, 'account-a', 'session')).toHaveLength(1);
    expect(await loadMetricEdges(database, 'account-b', 'session')).toHaveLength(0);
    expect(await loadKmSplits(database, 'account-a', 'session')).toHaveLength(1);
  });

  it('rolls back metric evidence when split persistence fails', async () => {
    const database = new MemoryDatabase(); database.failOn = 'INSERT INTO tracking_km_splits';
    await expect(database.transaction(async () => {
      await database.run('INSERT INTO tracking_metric_edges (id, owner_id, session_id, observation_timestamp_ms, processing_timestamp_ms, segment, distance_increment_meters, cumulative_distance_meters, active_elapsed_ms, accuracy_meters, edge_kind, metric_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['edge', 'account-a', 'session', 1000, 1000, 0, 10, 10, 1000, 3, 'movement', 2]);
      await database.run('INSERT INTO tracking_km_splits (id) VALUES (?)', ['split']);
    })).rejects.toThrow('Injected failure');
    expect(database.table('tracking_metric_edges')).toHaveLength(0);
  });
});
