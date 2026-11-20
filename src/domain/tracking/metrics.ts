/** GPS processing thresholds are engineering filters, not training policy. */
export const GPS_FILTER = {
  maxAccuracyMeters: 50,
  preferredAccuracyMeters: 20,
  maxGapMs: 30000,
  minDisplacementMeters: 5,
  maxSpeedMetersPerSecond: 12,
  smoothingWindowMs: 30000,
  futureTimestampToleranceMs: 5000,
  displacementConfidenceMultiplier: 2,
} as const;
export interface TrackPoint { latitude: number; longitude: number; accuracyMeters: number | null; timestampMs: number; }
export interface TrackState {
  distanceMeters: number;
  /** Last distance anchor. Jitter rejection deliberately does not move it. */
  lastPoint: TrackPoint | null;
  /** Last valid, in-order observation. This determines delivery continuity, not distance. */
  lastValidObservationTimestampMs: number | null;
  recent: { timestampMs: number; distanceMeters: number }[];
  acceptedPoints: number;
  rejectedPoints: number;
}
export type PointResult = { state: TrackState; accepted: boolean; reason: 'first' | 'accepted' | 'stale' | 'out_of_order' | 'accuracy' | 'invalid' | 'gap' | 'jitter' | 'jump'; distanceIncrementMeters: number };
export const emptyTrack = (): TrackState => ({ distanceMeters: 0, lastPoint: null, lastValidObservationTimestampMs: null, recent: [], acceptedPoints: 0, rejectedPoints: 0 });

/** Pauses, background interruptions and recovery must begin a new segment. */
export function breakTrackSegment(state: TrackState): TrackState { return { ...state, lastPoint: null, lastValidObservationTimestampMs: null, recent: [] }; }

export function movementAcceptanceThresholdMeters(previousAccuracyMeters: number | null, currentAccuracyMeters: number | null, metricVersion: 1 | 2 | 3): number | null {
  if (currentAccuracyMeters === null || !Number.isFinite(currentAccuracyMeters)) return null;
  return metricVersion === 1
    ? Math.max(GPS_FILTER.minDisplacementMeters, Math.min(currentAccuracyMeters, previousAccuracyMeters ?? 0))
    : Math.max(GPS_FILTER.minDisplacementMeters, GPS_FILTER.displacementConfidenceMultiplier * Math.hypot(currentAccuracyMeters, previousAccuracyMeters ?? currentAccuracyMeters));
}

export function trackPointDistanceMeters(a: TrackPoint, b: TrackPoint): number { return haversineMeters(a, b); }

export function acceptTrackPoint(state: TrackState, point: TrackPoint, processingTimestampMs: number, metricVersion: 1 | 2 | 3 = 1): PointResult {
  const rejected = (reason: PointResult['reason']): PointResult => ({ state: { ...state, rejectedPoints: state.rejectedPoints + 1 }, accepted: false, reason, distanceIncrementMeters: 0 });
  if (![point.latitude, point.longitude, point.timestampMs, processingTimestampMs].every(Number.isFinite) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || point.timestampMs > processingTimestampMs + GPS_FILTER.futureTimestampToleranceMs) return rejected('invalid');
  if (point.accuracyMeters === null || !Number.isFinite(point.accuracyMeters) || point.accuracyMeters < 0 || point.accuracyMeters > GPS_FILTER.maxAccuracyMeters) return rejected('accuracy');
  if (metricVersion === 1 && processingTimestampMs - point.timestampMs > GPS_FILTER.maxGapMs) return rejected('stale');
  if (state.lastValidObservationTimestampMs !== null && point.timestampMs <= state.lastValidObservationTimestampMs) return rejected(metricVersion === 1 ? 'stale' : 'out_of_order');
  const observationGap = state.lastValidObservationTimestampMs !== null && point.timestampMs - state.lastValidObservationTimestampMs > GPS_FILTER.maxGapMs;
  if (!state.lastPoint || observationGap) return { state: { ...state, lastPoint: point, lastValidObservationTimestampMs: point.timestampMs, recent: [{ timestampMs: point.timestampMs, distanceMeters: state.distanceMeters }], acceptedPoints: state.acceptedPoints + 1 }, accepted: true, reason: observationGap ? 'gap' : 'first', distanceIncrementMeters: 0 };
  const deltaMs = point.timestampMs - state.lastPoint.timestampMs;
  const distance = trackPointDistanceMeters(state.lastPoint, point);
  if (distance / (deltaMs / 1000) > GPS_FILTER.maxSpeedMetersPerSecond) return { ...rejected('jump'), state: { ...state, lastValidObservationTimestampMs: point.timestampMs, rejectedPoints: state.rejectedPoints + 1 } };
  const displacementFloor = movementAcceptanceThresholdMeters(state.lastPoint.accuracyMeters, point.accuracyMeters, metricVersion)!;
  if (distance < displacementFloor) return { ...rejected('jitter'), state: { ...state, lastValidObservationTimestampMs: point.timestampMs, rejectedPoints: state.rejectedPoints + 1 } };
  const distanceMeters = state.distanceMeters + distance;
  const recent = [...state.recent, { timestampMs: point.timestampMs, distanceMeters }].filter((sample) => point.timestampMs - sample.timestampMs <= GPS_FILTER.smoothingWindowMs);
  return { state: { ...state, distanceMeters, lastPoint: point, lastValidObservationTimestampMs: point.timestampMs, recent, acceptedPoints: state.acceptedPoints + 1 }, accepted: true, reason: 'accepted', distanceIncrementMeters: distance };
}

export function livePaceSecondsPerKm(state: TrackState, observedAtMs?: number): number | null { const first = state.recent[0]; const last = state.recent.at(-1); if (!first || !last || (observedAtMs !== undefined && observedAtMs - last.timestampMs > GPS_FILTER.smoothingWindowMs) || last.timestampMs <= first.timestampMs || last.distanceMeters - first.distanceMeters < GPS_FILTER.minDisplacementMeters) return null; return (last.timestampMs - first.timestampMs) / 1000 / (last.distanceMeters - first.distanceMeters) * 1000; }
export function averagePaceSecondsPerKm(distanceMeters: number | null, activeSeconds: number): number | null { return distanceMeters !== null && distanceMeters > 0 && activeSeconds > 0 ? activeSeconds * 1000 / distanceMeters : null; }
function haversineMeters(a: TrackPoint, b: TrackPoint): number { const radians = Math.PI / 180; const lat = (b.latitude - a.latitude) * radians; const lon = (b.longitude - a.longitude) * radians; const x = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))); }
