import { acceptTrackPoint, averagePaceSecondsPerKm, breakTrackSegment, emptyTrack, livePaceSecondsPerKm, type TrackPoint } from '@/domain/tracking/metrics';
import { activeSeconds, transitionSession, type TrainingSession } from '@/domain/tracking/session';

const point = (latitude: number, timestampMs: number, accuracyMeters: number | null = 3): TrackPoint => ({ latitude, longitude: 0, timestampMs, accuracyMeters });
it('filters jitter, inaccurate, duplicated, out-of-order and impossible points', () => {
  let state = acceptTrackPoint(emptyTrack(), point(0, 1000), 1000).state;
  expect(acceptTrackPoint(state, point(0.000001, 2000), 2000).reason).toBe('jitter');
  expect(acceptTrackPoint(state, point(0, 1000), 2000).reason).toBe('stale');
  expect(acceptTrackPoint(state, point(0.001, 2000, 100), 2000).reason).toBe('accuracy');
  expect(acceptTrackPoint(state, point(1, 2000), 2000).reason).toBe('jump');
  state = acceptTrackPoint(state, point(0.0001, 11000), 11000).state;
  expect(state.distanceMeters).toBeGreaterThan(10); expect(livePaceSecondsPerKm(state)).not.toBeNull();
});
it('enforces one lifecycle and preserves pause and interruption timestamps', () => {
  const initial: TrainingSession = { id: 'test', ownerId: 'owner', plannedSessionId: null, prescriptionSnapshot: null, mode: 'walk', status: 'preparing', startedAtMs: null, endedAtMs: null, segments: [], distanceMeters: null, metricVersion: 1 };
  const recording = transitionSession(initial, 'start', 1000); expect(() => transitionSession(recording, 'start', 2000)).toThrow();
  const paused = transitionSession(recording, 'pause', 6000); const resumed = transitionSession(paused, 'resume', 10000); const interrupted = transitionSession(resumed, 'interrupt', 14000);
  expect(activeSeconds(interrupted.segments, 50000)).toBe(9); expect(transitionSession(transitionSession(interrupted, 'finish', 50000), 'save', 50001).status).toBe('saved');
});
it('does not bridge a gap or pause and never invents pace', () => {
  let state = acceptTrackPoint(emptyTrack(), point(0, 1000), 1000).state;
  state = acceptTrackPoint(state, point(0.001, 50000), 50000).state;
  expect(state.distanceMeters).toBe(0); state = breakTrackSegment(state); state = acceptTrackPoint(state, point(0.002, 51000), 51000).state;
  expect(state.distanceMeters).toBe(0); expect(livePaceSecondsPerKm(state)).toBeNull(); expect(averagePaceSecondsPerKm(null, 200)).toBeNull();
  expect(activeSeconds([{ startedAtMs: 1000, endedAtMs: 11000 }, { startedAtMs: 20000, endedAtMs: null }], 25000)).toBe(15);
});
