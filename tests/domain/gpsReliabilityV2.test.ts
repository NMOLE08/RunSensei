import { acceptTrackPoint, emptyTrack, GPS_FILTER } from '@/domain/tracking/metrics';
import { completedKmSplits, rollingPaceFromEdges, selectLiveRunMetrics, type MetricEdgeEvidence } from '@/domain/tracking/liveRunMetrics';
import { activeMillisecondsAt, recordingSegmentAt } from '@/domain/tracking/session';

const point = (meters: number, timestampMs: number, accuracyMeters = 3) => ({ latitude: meters / 6371000 * 180 / Math.PI, longitude: 0, accuracyMeters, timestampMs });
const edge = (distance: number, active: number, timestamp: number, segment = 0, kind: MetricEdgeEvidence['kind'] = 'movement'): MetricEdgeEvidence => ({ sessionId: 'session', observationTimestampMs: timestamp, processingTimestampMs: timestamp, segment, distanceIncrementMeters: 0, cumulativeDistanceMeters: distance, activeElapsedMs: active, accuracyMeters: 3, kind, metricVersion: 2 });

describe('GPS metric version 2', () => {
  it('rejects captured pause locations and resolves exact segments', () => {
    const segments = [{ startedAtMs: 1000, endedAtMs: 10000 }, { startedAtMs: 70000, endedAtMs: null }];
    expect(recordingSegmentAt(segments, 10000)).toBe(0);
    expect(recordingSegmentAt(segments, 40000)).toBeNull();
    expect(recordingSegmentAt(segments, 70000)).toBe(1);
    expect(activeMillisecondsAt(segments, 80000)).toBe(19000);
  });

  it('suppresses the audited stationary oscillation but preserves slow accumulated movement', () => {
    let stationary = emptyTrack();
    for (let i = 0; i < 6; i += 1) stationary = acceptTrackPoint(stationary, point(i % 2 ? 8 : 0, 1000 + i * 10000), 1000 + i * 10000, 2).state;
    expect(stationary.distanceMeters).toBe(0);
    let walking = emptyTrack();
    for (let i = 0; i <= 5; i += 1) walking = acceptTrackPoint(walking, point(i * 10, 1000 + i * 5000), 1000 + i * 5000, 2).state;
    expect(walking.distanceMeters).toBeCloseTo(50);
  });

  it('accepts delayed ordered evidence without treating processing age as observation order', () => {
    const result = acceptTrackPoint(emptyTrack(), point(0, 1000), 120000, 2);
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe('first');
    expect(acceptTrackPoint(result.state, point(10, 900), 120000, 2).reason).toBe('out_of_order');
  });

  it('expires rolling pace based on evaluation time and excludes non-recording states', () => {
    const edges = [edge(0, 0, 1000, 0, 'anchor'), edge(100, 30000, 31000)];
    expect(rollingPaceFromEdges(edges, 31000, 'recording')).toBeCloseTo(300);
    expect(rollingPaceFromEdges(edges, 31000, 'recording', 1)).toBeNull();
    expect(rollingPaceFromEdges(edges, 31000 + GPS_FILTER.smoothingWindowMs + 1, 'recording')).toBeNull();
    expect(rollingPaceFromEdges(edges, 31000, 'paused')).toBeNull();
  });

  it('interpolates one and multiple kilometre boundaries using active time', () => {
    const splits = completedKmSplits('session', [edge(0, 0, 0, 0, 'anchor'), edge(2500, 750000, 750000)]);
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ kilometre: 1, crossingActiveMs: 300000, durationMs: 300000, paceSecPerKm: 300 });
    expect(splits[1]).toMatchObject({ kilometre: 2, crossingActiveMs: 600000, durationMs: 300000, paceSecPerKm: 300 });
  });

  it('does not interpolate across a pause segment and marks gap coverage', () => {
    const splits = completedKmSplits('session', [edge(900, 270000, 270000), edge(900, 270000, 300000, 1, 'anchor'), edge(1100, 330000, 360000, 1, 'movement')]);
    expect(splits).toHaveLength(1);
    expect(splits[0].crossingActiveMs).toBe(300000);
    const gapped = completedKmSplits('session', [edge(0, 0, 0, 0, 'anchor'), edge(0, 30000, 30000, 0, 'gap'), edge(1100, 360000, 360000)]);
    expect(gapped[0].gpsCoverage).toBe('gaps');
  });

  it('distinguishes legacy unavailable splits from supported empty splits', () => {
    const quality = { state: 'acquiring' as const, reasonCodes: ['awaiting_first_fix'], lastReceivedTimestampMs: null, lastAcceptedTimestampMs: null, accuracyMeters: null };
    const common = { sessionId: 's', ownerId: 'a', observedAtMs: 1000, activeElapsedMs: 1000, distanceMeters: 0, recordingState: 'recording' as const, persistedSplits: null, quality };
    expect(selectLiveRunMetrics({ ...common, metricVersion: 1, edges: null }).completedKmSplits).toBeNull();
    expect(selectLiveRunMetrics({ ...common, metricVersion: 2, edges: [] }).completedKmSplits).toEqual([]);
  });

  it('does not combine a running timer with a known stale persisted distance', () => {
    const quality = { state: 'reliable' as const, reasonCodes: [], lastReceivedTimestampMs: 1000, lastAcceptedTimestampMs: 1000, accuracyMeters: 3 };
    const base = { sessionId: 's', ownerId: 'a', metricVersion: 3 as const, observedAtMs: 60000, activeElapsedMs: 60000, distanceMeters: 200, recordingState: 'recording' as const, edges: [], persistedSplits: [], quality };
    expect(selectLiveRunMetrics({ ...base, refreshHealth: { status: 'failed', lastAttemptMs: 60000, lastSuccessMs: 1000, snapshotCheckpointAtMs: 1000, snapshotAgeMs: 59000, errorStage: 'evidence_read', errorCode: 'database_unavailable' } }).averagePaceSecPerKm).toBeNull();
    expect(selectLiveRunMetrics({ ...base, refreshHealth: { status: 'recovering', lastAttemptMs: 61000, lastSuccessMs: 1000, snapshotCheckpointAtMs: 1000, snapshotAgeMs: 60000, errorStage: 'evidence_read', errorCode: 'database_unavailable' } })).toMatchObject({ averagePaceSecPerKm: null, rollingPaceSecPerKm: null });
    expect(selectLiveRunMetrics({ ...base, refreshHealth: { status: 'recovered', lastAttemptMs: 60000, lastSuccessMs: 60000, snapshotCheckpointAtMs: 60000, snapshotAgeMs: 0, errorStage: null, errorCode: null } }).averagePaceSecPerKm).toBeCloseTo(300);
  });
});
