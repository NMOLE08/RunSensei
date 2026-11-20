import { emptyMovementEvidenceV4, observeMovementV4 } from '@/domain/tracking/movementEvidenceV4';
import type { TrackPoint } from '@/domain/tracking/metrics';

const EARTH_RADIUS_METERS = 6371000;
const point = (x: number, y: number, timestampMs: number, accuracyMeters = 3): TrackPoint => ({
  latitude: y / EARTH_RADIUS_METERS * 180 / Math.PI,
  longitude: x / EARTH_RADIUS_METERS * 180 / Math.PI,
  timestampMs,
  accuracyMeters,
});

function recordedDistance(points: readonly TrackPoint[]): { distance: number; unresolved: boolean } {
  let state = emptyMovementEvidenceV4();
  let distance = 0;
  for (const observation of points) {
    const result = observeMovementV4(state, observation);
    state = result.state;
    distance += result.distanceIncrementMeters;
  }
  return { distance, unresolved: state.unresolved };
}

function lineTrace(length: number, step: number, intervalMs: number, accuracy: (index: number) => number): TrackPoint[] {
  return Array.from({ length: Math.floor(length / step) + 1 }, (_, index) => point(index * step, 0, index * intervalMs, accuracy(index)));
}

function circleTrace(radius: number, accuracyMeters: number): TrackPoint[] {
  return Array.from({ length: 181 }, (_, index) => {
    const angle = index * 2 * Math.PI / 180;
    return point(radius * Math.cos(angle), radius * Math.sin(angle), index * 1000, accuracyMeters);
  });
}

describe('GPS metric version 4 movement evidence prototype', () => {
  test('suppresses the audited stationary oscillation', () => {
    const trace = Array.from({ length: 61 }, (_, index) => point(index % 2 ? 8 : 0, 0, index * 2000, 3));
    expect(recordedDistance(trace).distance).toBe(0);
  });

  test('fails the production gate because incoherent stationary scatter accumulates', () => {
    let seed = 123456789;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
    const trace = Array.from({ length: 180 }, (_, index) => {
      const radius = random() * 8;
      const angle = random() * Math.PI * 2;
      return point(radius * Math.cos(angle), radius * Math.sin(angle), index * 1000, 3);
    });
    // The prototype remains isolated from production while this is high.
    expect(recordedDistance(trace).distance).toBeGreaterThan(50);
  });

  test('records straight slow walking with uncertain fixes', () => {
    const trace = Array.from({ length: 61 }, (_, index) => point(index * 2, 0, index * 2000, 20));
    expect(recordedDistance(trace).distance).toBeGreaterThanOrEqual(110);
  });

  test('records a 20 metre radius circular route instead of returning zero', () => {
    const trace = Array.from({ length: 181 }, (_, index) => {
      const angle = index * 2 * Math.PI / 180;
      return point(20 * Math.cos(angle), 20 * Math.sin(angle), index * 1000, 20);
    });
    const result = recordedDistance(trace);
    expect(result.distance).toBeGreaterThan(90);
    expect(result.distance).toBeLessThan(2 * Math.PI * 20);
  });

  test('records meaningful distance through an 80 metre U-turn', () => {
    const outbound = Array.from({ length: 81 }, (_, index) => point(index, 0, index * 1000, 20));
    const inbound = Array.from({ length: 80 }, (_, index) => point(79 - index, 0, (81 + index) * 1000, 20));
    expect(recordedDistance([...outbound, ...inbound]).distance).toBeGreaterThanOrEqual(110);
  });

  test('treats a real delivery gap as a new unresolved anchor', () => {
    const trace = [point(0, 0, 0), point(10, 0, 5000), point(20, 0, 10000), point(100, 0, 50000), point(110, 0, 55000)];
    const result = recordedDistance(trace);
    expect(result.distance).toBeLessThan(100);
  });

  test('characterizes the complete deterministic movement matrix', () => {
    const outbound40 = lineTrace(40, 1, 1000, () => 20);
    const inbound40 = Array.from({ length: 40 }, (_, index) => point(39 - index, 0, (41 + index) * 1000, 20));
    const outbound80 = lineTrace(80, 1, 1000, () => 20);
    const inbound80 = Array.from({ length: 80 }, (_, index) => point(79 - index, 0, (81 + index) * 1000, 20));
    const zigzag = [point(0, 0, 0, 10), point(20, 20, 10000, 10), point(40, 0, 20000, 10), point(60, 20, 30000, 10), point(80, 0, 40000, 10)];
    const irregular = Array.from({ length: 61 }, (_, index) => point(index * 2, 0, [0, 800, 2600, 4100][index % 4] + Math.floor(index / 4) * 5000, 10));
    const temporaryLoss = [...lineTrace(50, 5, 2500, () => 5), ...Array.from({ length: 11 }, (_, index) => point(100 + index * 5, 0, 60000 + index * 2500, 5))];
    const cases = [
      ['straight20', lineTrace(120, 2, 2000, () => 20), 120],
      ['slow20', lineTrace(120, 1, 1000, () => 20), 120],
      ['circle10', circleTrace(10, 20), 2 * Math.PI * 10],
      ['circle20', circleTrace(20, 20), 2 * Math.PI * 20],
      ['circle40', circleTrace(40, 20), 2 * Math.PI * 40],
      ['outback40', [...outbound40, ...inbound40], 80],
      ['uturn80', [...outbound80, ...inbound80], 160],
      ['zigzag', zigzag, 4 * Math.hypot(20, 20)],
      ['highFrequency', lineTrace(120, 0.5, 250, () => 5), 120],
      ['poorAccuracy', lineTrace(120, 2, 2000, () => 40), 120],
      ['poorToGood', lineTrace(120, 2, 2000, index => index < 30 ? 20 : 3), 120],
      ['goodToPoor', lineTrace(120, 2, 2000, index => index < 30 ? 3 : 20), 120],
      ['irregular', irregular, 120],
      ['temporaryLoss', temporaryLoss, 100],
    ] as const;
    const report = cases.map(([name, trace, truth]) => {
      const result = recordedDistance(trace);
      return { name, truth, recorded: result.distance, error: result.distance - truth, errorPercent: (result.distance - truth) / truth * 100, unresolved: result.unresolved };
    });
    console.info(`GPS_V4_MATRIX=${JSON.stringify(report)}`);
    expect(report.find(value => value.name === 'circle20')?.recorded).toBeGreaterThan(100);
    expect(report.find(value => value.name === 'uturn80')?.recorded).toBeGreaterThan(120);
    expect(report.find(value => value.name === 'highFrequency')?.recorded).toBeGreaterThan(110);
  });
});
