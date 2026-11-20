import { acceptTrackPoint, emptyTrack } from '@/domain/tracking/metrics';
import { activeMillisecondsAt, recordingSegmentAt, validateRecordingTimeline } from '@/domain/tracking/session';
import { completedKmSplits, rollingPaceFromEdges, type MetricEdgeEvidence } from '@/domain/tracking/liveRunMetrics';

const point = (x: number, y: number, timestampMs: number, accuracyMeters = 3) => ({
  latitude: y / 6371000 * 180 / Math.PI,
  longitude: x / 6371000 * 180 / Math.PI,
  timestampMs, accuracyMeters,
});
const edge = (distance: number, time: number, kind: MetricEdgeEvidence['kind'] = 'movement'): MetricEdgeEvidence => ({
  sessionId: 'review', segment: 0, observationTimestampMs: time, processingTimestampMs: time,
  distanceIncrementMeters: 0, cumulativeDistanceMeters: distance, activeElapsedMs: time,
  accuracyMeters: 3, kind, metricVersion: 2,
});

describe('independent GPS v2 review', () => {
  test('R1: historical observation time clips closed segments and excludes future segments', () => {
    const segments = [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 20000, endedAtMs: 30000 }, { startedAtMs: 40000, endedAtMs: null }];
    expect(activeMillisecondsAt(segments, 5000)).toBe(5000); // Currently 20000.
  });

  test('R2: frequent usable slow-walk fixes are not mistaken for repeated GPS outages', () => {
    let state = emptyTrack();
    for (let i = 0; i <= 60; i += 1) {
      const sample = point(i * 2, 0, i * 2000, 20);
      state = acceptTrackPoint(state, sample, sample.timestampMs, 2).state;
    }
    // 120 m straight walk, 2 m per update; allow an unfinished uncertainty chunk.
    expect(state.distanceMeters).toBeGreaterThan(60); // Currently zero.
  });

  test('2 m updates accumulate with a sufficiently small uncertainty radius', () => {
    let state = emptyTrack();
    for (let i = 0; i <= 60; i += 1) {
      const sample = point(i * 2, 0, i * 2000);
      state = acceptTrackPoint(state, sample, sample.timestampMs, 2).state;
    }
    expect(state.distanceMeters).toBeCloseTo(120);
  });

  test('characterizes lost out-and-back movement below the uncertainty radius', () => {
    let state = emptyTrack();
    for (let i = 0; i <= 30; i += 1) {
      const sample = point(i % 2 ? 8 : 0, 0, i * 2000);
      state = acceptTrackPoint(state, sample, sample.timestampMs, 2).state;
    }
    // Indistinguishable from the stationary oscillation the guard suppresses.
    expect(state.distanceMeters).toBe(0);
  });

  test('characterizes chord undercounting on a curved route', () => {
    let state = emptyTrack();
    for (let i = 0; i <= 120; i += 1) {
      const angle = i * Math.PI / 30;
      const sample = point(10 * Math.cos(angle), 10 * Math.sin(angle), i * 1000);
      state = acceptTrackPoint(state, sample, sample.timestampMs, 2).state;
    }
    const actualArc = 40 * Math.PI;
    expect(state.distanceMeters).toBeGreaterThan(100);
    expect(state.distanceMeters).toBeLessThan(actualArc * 0.96);
  });

  test('pause boundaries are inclusive and paused interior is excluded', () => {
    const segments = [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 70000, endedAtMs: null }];
    expect(recordingSegmentAt(segments, 10000)).toBe(0);
    expect(recordingSegmentAt(segments, 10001)).toBeNull();
    expect(recordingSegmentAt(segments, 70000)).toBe(1);
    expect(activeMillisecondsAt(segments, 80000)).toBe(20000);
  });

  test.each([
    ['overlap', [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 5000, endedAtMs: 15000 }], 'overlapping_segment'],
    ['nested', [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 2000, endedAtMs: 8000 }], 'overlapping_segment'],
    ['duplicate', [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 0, endedAtMs: 10000 }], 'overlapping_segment'],
    ['out of order', [{ startedAtMs: 10000, endedAtMs: 20000 }, { startedAtMs: 0, endedAtMs: 5000 }], 'out_of_order_segment'],
    ['negative', [{ startedAtMs: 10000, endedAtMs: 9000 }], 'negative_duration_segment'],
    ['open not last', [{ startedAtMs: 0, endedAtMs: null }, { startedAtMs: 10000, endedAtMs: null }], 'open_segment_not_last'],
  ])('rejects malformed %s recording evidence', (_label, segments, issue) => {
    expect(validateRecordingTimeline(segments)).toMatchObject({ valid: false, issue });
    expect(() => activeMillisecondsAt(segments, 8000)).toThrow('invalid_recording_timeline');
  });

  test('accepts generated pause/resume boundaries and remains monotonic', () => {
    const segments = [{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 10000, endedAtMs: 20000 }, { startedAtMs: 30000, endedAtMs: null }];
    expect(validateRecordingTimeline(segments)).toEqual({ valid: true });
    const positions = [-1000, 0, 5000, 10000, 15000, 20000, 25000, 35000].map(time => activeMillisecondsAt(segments, time));
    expect(positions).toEqual([0, 0, 5000, 10000, 15000, 20000, 20000, 25000]);
    expect(positions.every((value, index) => index === 0 || value >= positions[index - 1])).toBe(true);
  });

  test('split interpolation and freshness remain deterministic across a long ledger', () => {
    const edges = Array.from({ length: 1001 }, (_, i) => edge(i * 10, i * 5000, i === 0 ? 'anchor' : 'movement'));
    const splits = completedKmSplits('review', edges);
    expect(splits).toHaveLength(10);
    expect(splits.every(split => split.durationMs === 500000)).toBe(true);
    expect(completedKmSplits('review', JSON.parse(JSON.stringify(edges)))).toEqual(splits);
    expect(rollingPaceFromEdges(edges, 5030001, 'recording')).toBeNull();
    expect(rollingPaceFromEdges(edges, 5000000, 'paused')).toBeNull();
  });
});
