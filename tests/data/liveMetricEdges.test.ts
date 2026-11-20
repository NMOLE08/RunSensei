import { loadLiveMetricEdges } from '@/data/trackingMetricsRepository';
import type { SqlDatabase } from '@/data/database';

describe('bounded live metric evidence', () => {
  it('loads both post-split evidence and the rolling window that crosses a kilometre boundary', async () => {
    const getAll = jest.fn().mockResolvedValue([
      { session_id: 'session-1', observation_timestamp_ms: 98000, processing_timestamp_ms: 98100, segment: 2, distance_increment_meters: 10, cumulative_distance_meters: 995, active_elapsed_ms: 298000, accuracy_meters: 4, edge_kind: 'movement', metric_version: 3 },
      { session_id: 'session-1', observation_timestamp_ms: 100000, processing_timestamp_ms: 100100, segment: 2, distance_increment_meters: 10, cumulative_distance_meters: 1005, active_elapsed_ms: 300000, accuracy_meters: 4, edge_kind: 'movement', metric_version: 3 },
    ]);
    const database = {
      getFirst: jest.fn()
        .mockResolvedValueOnce({ crossing_active_ms: 300000 })
        .mockResolvedValueOnce({ observation_timestamp_ms: 100000, segment: 2 }),
      getAll,
    } as unknown as SqlDatabase;

    const edges = await loadLiveMetricEdges(database, 'account-1', 'session-1');

    expect(edges.map(edge => edge.cumulativeDistanceMeters)).toEqual([995, 1005]);
    expect(getAll).toHaveBeenCalledWith(expect.stringContaining('(active_elapsed_ms >= ? OR (segment = ? AND observation_timestamp_ms >= ?))'), ['account-1', 'session-1', 300000, 2, 70000]);
  });
});
