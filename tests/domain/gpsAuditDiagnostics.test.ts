import { acceptTrackPoint, emptyTrack, livePaceSecondsPerKm, averagePaceSecondsPerKm } from '@/domain/tracking/metrics';
import { activeSeconds } from '@/domain/tracking/session';

const point = (meters: number, timestampMs: number) => ({ latitude: meters / 6371000 * 180 / Math.PI, longitude: 0, accuracyMeters: 3, timestampMs });
// Characterization tests: these document current limitations, not desired fixes.
describe('GPS audit characterization', () => {
  it('calculates a steady 3 m/s trace and its average pace', () => {
    let track = emptyTrack();
    for (let t = 0; t <= 30; t += 2) track = acceptTrackPoint(track, point(t * 3, 1000 + t * 1000), 1000 + t * 1000).state;
    expect(track.distanceMeters).toBeCloseTo(90);
    expect(livePaceSecondsPerKm(track)).toBeCloseTo(1000 / 3);
    expect(averagePaceSecondsPerKm(90, 30)).toBeCloseTo(1000 / 3);
  });
  it('retains rolling pace indefinitely without new locations', () => {
    let track = acceptTrackPoint(emptyTrack(), point(0, 1000), 1000).state;
    track = acceptTrackPoint(track, point(30, 11000), 11000).state;
    expect(livePaceSecondsPerKm(track)).toBeCloseTo(1000 / 3);
    track = acceptTrackPoint(track, point(30, 120000), 120000).state;
    expect(livePaceSecondsPerKm(track)).toBeNull();
    expect(track.distanceMeters).toBeCloseTo(30);
  });
  it('accepts plausible stationary drift exceeding the displacement filter', () => {
    let track = emptyTrack();
    for (let i = 0; i < 6; i++) track = acceptTrackPoint(track, point(i % 2 ? 8 : 0, 1000 + i * 10000), 1000 + i * 10000).state;
    expect(track.distanceMeters).toBeCloseTo(40);
  });
  it('drops old batched observations even if their mutual order is valid', () => {
    expect(acceptTrackPoint(emptyTrack(), point(0, 1000), 62000).reason).toBe('stale');
  });
  it('excludes a 60-second pause and handles unknown/zero distance', () => {
    const seconds = activeSeconds([{ startedAtMs: 0, endedAtMs: 10000 }, { startedAtMs: 70000, endedAtMs: null }], 80000);
    expect(seconds).toBe(20);
    expect(averagePaceSecondsPerKm(100, seconds)).toBe(200);
    expect(averagePaceSecondsPerKm(0, seconds)).toBeNull();
    expect(livePaceSecondsPerKm(emptyTrack())).toBeNull();
  });
  it('crosses 1 km on a continuous trace but exposes no split records', () => {
    let track = emptyTrack();
    for (let i = 0; i <= 101; i++) track = acceptTrackPoint(track, point(i * 10, 1000 + i * 5000), 1000 + i * 5000).state;
    expect(track.distanceMeters).toBeCloseTo(1010);
    expect(track).not.toHaveProperty('completedKmSplits');
    expect(acceptTrackPoint(track, point(4000, 507000), 507000).reason).toBe('jump');
  });
});
