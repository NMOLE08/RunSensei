import { GPS_FILTER, type TrackPoint } from './metrics';

export const MOVEMENT_EVIDENCE_V4 = {
  windowMs: GPS_FILTER.smoothingWindowMs,
  maxPoints: 64,
  minimumCoherentObservations: 4,
} as const;

export interface MovementEvidenceV4State {
  anchor: TrackPoint | null;
  lastValidPoint: TrackPoint | null;
  observations: readonly TrackPoint[];
  unresolved: boolean;
}

export interface MovementEvidenceV4Result {
  state: MovementEvidenceV4State;
  distanceIncrementMeters: number;
  reason: 'anchor' | 'movement' | 'pending' | 'gap' | 'jump';
}

export const emptyMovementEvidenceV4 = (): MovementEvidenceV4State => ({
  anchor: null,
  lastValidPoint: null,
  observations: [],
  unresolved: false,
});

function haversineMeters(a: TrackPoint, b: TrackPoint): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function localVectorMeters(origin: TrackPoint, point: TrackPoint): { x: number; y: number } {
  const radians = Math.PI / 180;
  const averageLatitude = ((origin.latitude + point.latitude) / 2) * radians;
  return {
    x: (point.longitude - origin.longitude) * radians * 6371000 * Math.cos(averageLatitude),
    y: (point.latitude - origin.latitude) * radians * 6371000,
  };
}

function boundedObservations(points: readonly TrackPoint[], newestTimestampMs: number): TrackPoint[] {
  return points
    .filter(point => newestTimestampMs - point.timestampMs <= MOVEMENT_EVIDENCE_V4.windowMs)
    .slice(-MOVEMENT_EVIDENCE_V4.maxPoints);
}

/**
 * A candidate chord is committed only after several observations show monotonic
 * forward projection along it. This rejects a two-position oscillation without
 * summing every noisy raw displacement. The committed distance remains the
 * conservative anchor-to-observation chord.
 */
function hasCoherentForwardEvidence(anchor: TrackPoint, candidate: TrackPoint, observations: readonly TrackPoint[]): boolean {
  const direction = localVectorMeters(anchor, candidate);
  const magnitude = Math.hypot(direction.x, direction.y);
  if (magnitude === 0) return false;
  const recent = observations.slice(-MOVEMENT_EVIDENCE_V4.minimumCoherentObservations);
  if (recent.length < MOVEMENT_EVIDENCE_V4.minimumCoherentObservations) return false;
  let previousProjection = Number.NEGATIVE_INFINITY;
  for (const observation of recent) {
    const vector = localVectorMeters(anchor, observation);
    const projection = (vector.x * direction.x + vector.y * direction.y) / magnitude;
    if (projection <= previousProjection) return false;
    previousProjection = projection;
  }
  return true;
}

export function observeMovementV4(state: MovementEvidenceV4State, point: TrackPoint): MovementEvidenceV4Result {
  if (!state.anchor || !state.lastValidPoint) {
    return { state: { anchor: point, lastValidPoint: point, observations: [point], unresolved: false }, distanceIncrementMeters: 0, reason: 'anchor' };
  }

  const gapMs = point.timestampMs - state.lastValidPoint.timestampMs;
  if (gapMs > MOVEMENT_EVIDENCE_V4.windowMs) {
    return { state: { anchor: point, lastValidPoint: point, observations: [point], unresolved: false }, distanceIncrementMeters: 0, reason: 'gap' };
  }

  const consecutiveDistance = haversineMeters(state.lastValidPoint, point);
  if (gapMs <= 0 || consecutiveDistance / (gapMs / 1000) > GPS_FILTER.maxSpeedMetersPerSecond) {
    return { state, distanceIncrementMeters: 0, reason: 'jump' };
  }

  const observations = boundedObservations([...state.observations, point], point.timestampMs);
  const displacement = haversineMeters(state.anchor, point);
  const anchorAccuracy = state.anchor.accuracyMeters ?? GPS_FILTER.maxAccuracyMeters;
  const pointAccuracy = point.accuracyMeters ?? GPS_FILTER.maxAccuracyMeters;
  // Several monotonic observations corroborate the displacement. Use the larger
  // reported horizontal radius as the conservative spatial floor; combining the
  // radii again here would double-penalize evidence already corroborated over time.
  const uncertaintyFloor = Math.max(GPS_FILTER.minDisplacementMeters, anchorAccuracy, pointAccuracy);
  const unresolved = displacement > 0 || state.unresolved;

  if (displacement < uncertaintyFloor || !hasCoherentForwardEvidence(state.anchor, point, observations)) {
    return { state: { ...state, lastValidPoint: point, observations, unresolved }, distanceIncrementMeters: 0, reason: 'pending' };
  }

  return {
    state: { anchor: point, lastValidPoint: point, observations: [point], unresolved: false },
    distanceIncrementMeters: displacement,
    reason: 'movement',
  };
}

