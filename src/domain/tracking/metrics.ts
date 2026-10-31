/** GPS processing thresholds are engineering filters, not training policy. */
export const GPS_FILTER = { maxAccuracyMeters: 50, maxGapMs: 30000, minDisplacementMeters: 5, maxSpeedMetersPerSecond: 12, smoothingWindowMs: 30000 } as const;
export interface TrackPoint { latitude: number; longitude: number; accuracyMeters: number | null; timestampMs: number; }
export interface TrackState { distanceMeters: number; lastPoint: TrackPoint | null; recent: { timestampMs: number; distanceMeters: number }[]; acceptedPoints: number; rejectedPoints: number; }
export type PointResult = { state: TrackState; accepted: boolean; reason: 'first' | 'accepted' | 'stale' | 'accuracy' | 'invalid' | 'gap' | 'jitter' | 'jump' };
export const emptyTrack = (): TrackState => ({ distanceMeters: 0, lastPoint: null, recent: [], acceptedPoints: 0, rejectedPoints: 0 });

/** Pauses, background interruptions and recovery must begin a new segment. */
export function breakTrackSegment(state: TrackState): TrackState { return { ...state, lastPoint: null, recent: [] }; }

export function acceptTrackPoint(state: TrackState, point: TrackPoint, nowMs: number): PointResult {
  const rejected = (reason: PointResult['reason']): PointResult => ({ state: { ...state, rejectedPoints: state.rejectedPoints + 1 }, accepted: false, reason });
  if (![point.latitude, point.longitude, point.timestampMs, nowMs].every(Number.isFinite) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || point.timestampMs > nowMs + 5000) return rejected('invalid');
  if (point.accuracyMeters === null || !Number.isFinite(point.accuracyMeters) || point.accuracyMeters < 0 || point.accuracyMeters > GPS_FILTER.maxAccuracyMeters) return rejected('accuracy');
  if (nowMs - point.timestampMs > GPS_FILTER.maxGapMs || (state.lastPoint && point.timestampMs <= state.lastPoint.timestampMs)) return rejected('stale');
  if (!state.lastPoint) return { state: { ...state, lastPoint: point, recent: [{ timestampMs: point.timestampMs, distanceMeters: state.distanceMeters }], acceptedPoints: state.acceptedPoints + 1 }, accepted: true, reason: 'first' };
  const deltaMs = point.timestampMs - state.lastPoint.timestampMs;
  if (deltaMs > GPS_FILTER.maxGapMs) return { state: { ...state, lastPoint: point, recent: [{ timestampMs: point.timestampMs, distanceMeters: state.distanceMeters }], acceptedPoints: state.acceptedPoints + 1 }, accepted: true, reason: 'gap' };
  const distance = haversineMeters(state.lastPoint, point);
  if (distance / (deltaMs / 1000) > GPS_FILTER.maxSpeedMetersPerSecond) return rejected('jump');
  if (distance < Math.max(GPS_FILTER.minDisplacementMeters, Math.min(point.accuracyMeters, state.lastPoint.accuracyMeters ?? 0))) return rejected('jitter');
  const distanceMeters = state.distanceMeters + distance;
  const recent = [...state.recent, { timestampMs: point.timestampMs, distanceMeters }].filter((sample) => point.timestampMs - sample.timestampMs <= GPS_FILTER.smoothingWindowMs);
  return { state: { ...state, distanceMeters, lastPoint: point, recent, acceptedPoints: state.acceptedPoints + 1 }, accepted: true, reason: 'accepted' };
}

export function livePaceSecondsPerKm(state: TrackState): number | null { const first = state.recent[0]; const last = state.recent.at(-1); if (!first || !last || last.timestampMs <= first.timestampMs || last.distanceMeters - first.distanceMeters < GPS_FILTER.minDisplacementMeters) return null; return (last.timestampMs - first.timestampMs) / 1000 / (last.distanceMeters - first.distanceMeters) * 1000; }
export function averagePaceSecondsPerKm(distanceMeters: number | null, activeSeconds: number): number | null { return distanceMeters !== null && distanceMeters > 0 && activeSeconds > 0 ? activeSeconds * 1000 / distanceMeters : null; }
function haversineMeters(a: TrackPoint, b: TrackPoint): number { const radians = Math.PI / 180; const lat = (b.latitude - a.latitude) * radians; const lon = (b.longitude - a.longitude) * radians; const x = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))); }
