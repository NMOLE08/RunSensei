import type { GuidedPhase, GuidedProgress } from './guidedWorkout';
import { GPS_FILTER, averagePaceSecondsPerKm } from './metrics';
import type { TrackingMetricVersion, TrackingState } from './session';

export type GpsQualityState = 'acquiring' | 'reliable' | 'degraded' | 'stale' | 'unavailable';
export type GpsCoverage = 'continuous' | 'gaps';

export interface CompletedKmSplit {
  id: string;
  kilometre: number;
  crossingActiveMs: number;
  durationMs: number;
  paceSecPerKm: number;
  gpsCoverage: GpsCoverage;
  metricVersion: 2 | 3;
  splitVersion: 1;
}

export interface GuidedPhaseView {
  progress: GuidedProgress;
  current: GuidedPhase | null;
  next: GuidedPhase | null;
  elapsedInPhaseSeconds: number;
  remainingSeconds: number | null;
  overallProgress: number;
  canManuallyComplete: boolean;
  allPhasesElapsed: boolean;
}

export interface LiveRunMetrics {
  sessionId: string;
  ownerId: string;
  metricVersion: TrackingMetricVersion;
  observedAtMs: number;
  activeElapsedMs: number;
  distanceMeters: number | null;
  averagePaceSecPerKm: number | null;
  rollingPaceSecPerKm: number | null;
  completedKmSplits: readonly CompletedKmSplit[] | null;
  currentPartialKm: { kilometre: number; distanceMeters: number; activeElapsedMs: number; gpsCoverage: GpsCoverage } | null;
  gpsQuality: {
    state: GpsQualityState;
    reasonCodes: readonly string[];
    lastReceivedTimestampMs: number | null;
    lastAcceptedTimestampMs: number | null;
    accuracyMeters: number | null;
  };
  recordingState: TrackingState;
  lastAcceptedLocationTimestampMs: number | null;
  guidedPhase: GuidedPhaseView | null;
  refreshHealth: MetricsRefreshHealth;
}

export interface MetricEdgeEvidence {
  sessionId: string;
  observationTimestampMs: number;
  processingTimestampMs: number;
  segment: number;
  distanceIncrementMeters: number;
  cumulativeDistanceMeters: number;
  activeElapsedMs: number;
  accuracyMeters: number;
  kind: 'anchor' | 'movement' | 'gap';
  metricVersion: 2 | 3;
}

export interface PersistedGpsQuality {
  state: GpsQualityState;
  reasonCodes: readonly string[];
  lastReceivedTimestampMs: number | null;
  lastAcceptedTimestampMs: number | null;
  accuracyMeters: number | null;
}

/**
 * Health of the read path that supplies persisted GPS evidence to the live UI.
 * This is deliberately separate from GPS quality: a reliable fix is not proof
 * that the foreground screen has refreshed its saved checkpoint.
 */
export type MetricsRefreshStage = 'idle' | 'account_resolution' | 'database_open' | 'migration_readiness' | 'session_lookup' | 'evidence_read' | 'timeline_validation' | 'snapshot_publication' | 'foreground_permission' | 'location_service' | 'native_task';
export type MetricsRefreshStatus = 'current' | 'pending' | 'recovering' | 'failed' | 'stale' | 'recovered';
export interface MetricsRefreshHealth {
  status: MetricsRefreshStatus;
  lastAttemptMs: number | null;
  lastSuccessMs: number | null;
  snapshotCheckpointAtMs: number | null;
  snapshotAgeMs: number | null;
  errorStage: MetricsRefreshStage | null;
  /** Sanitised internal category; never an exception message or account id. */
  errorCode: string | null;
}

/** Splits derive only from accepted, versioned movement evidence. */
export function completedKmSplits(sessionId: string, edges: readonly MetricEdgeEvidence[], initialCrossingActiveMs = 0): CompletedKmSplit[] {
  const ordered = [...edges].sort((a, b) => a.observationTimestampMs - b.observationTimestampMs);
  const result: CompletedKmSplit[] = [];
  let previous: MetricEdgeEvidence | null = null;
  let gapsSinceBoundary = false;
  let previousCrossingActiveMs = initialCrossingActiveMs;
  for (const edge of ordered) {
    if (edge.kind === 'gap') gapsSinceBoundary = true;
    if (!previous || previous.segment !== edge.segment || edge.kind !== 'movement' || edge.cumulativeDistanceMeters <= previous.cumulativeDistanceMeters) {
      previous = edge;
      continue;
    }
    const firstBoundary = Math.floor(previous.cumulativeDistanceMeters / 1000) + 1;
    const lastBoundary = Math.floor(edge.cumulativeDistanceMeters / 1000);
    for (let kilometre = firstBoundary; kilometre <= lastBoundary; kilometre += 1) {
      const boundary = kilometre * 1000;
      const fraction = (boundary - previous.cumulativeDistanceMeters) / (edge.cumulativeDistanceMeters - previous.cumulativeDistanceMeters);
      const crossingActiveMs = Math.round(previous.activeElapsedMs + fraction * (edge.activeElapsedMs - previous.activeElapsedMs));
      const durationMs = Math.max(0, crossingActiveMs - previousCrossingActiveMs);
      result.push({
        id: `${sessionId}:km:${kilometre}`,
        kilometre,
        crossingActiveMs,
        durationMs,
        paceSecPerKm: durationMs / 1000,
        gpsCoverage: gapsSinceBoundary ? 'gaps' : 'continuous',
        metricVersion: edge.metricVersion,
        splitVersion: 1,
      });
      previousCrossingActiveMs = crossingActiveMs;
      gapsSinceBoundary = false;
    }
    previous = edge;
  }
  return result;
}

export function rollingPaceFromEdges(edges: readonly MetricEdgeEvidence[], observedAtMs: number, recordingState: TrackingState, currentSegment?: number): number | null {
  if (recordingState !== 'recording') return null;
  const accepted = [...edges].filter(edge => currentSegment === undefined || edge.segment === currentSegment).sort((a, b) => a.observationTimestampMs - b.observationTimestampMs);
  const last = accepted.at(-1);
  if (!last || observedAtMs - last.observationTimestampMs > GPS_FILTER.smoothingWindowMs) return null;
  const selectedSegment = last.segment;
  const recent = accepted.filter(edge => edge.segment === selectedSegment && last.observationTimestampMs - edge.observationTimestampMs <= GPS_FILTER.smoothingWindowMs);
  const first = recent[0];
  if (!first || last.observationTimestampMs <= first.observationTimestampMs || last.cumulativeDistanceMeters - first.cumulativeDistanceMeters < GPS_FILTER.minDisplacementMeters) return null;
  return (last.observationTimestampMs - first.observationTimestampMs) / 1000 / (last.cumulativeDistanceMeters - first.cumulativeDistanceMeters) * 1000;
}

export function selectLiveRunMetrics(input: {
  sessionId: string;
  ownerId: string;
  metricVersion: TrackingMetricVersion;
  observedAtMs: number;
  activeElapsedMs: number;
  distanceMeters: number | null;
  recordingState: TrackingState;
  edges: readonly MetricEdgeEvidence[] | null;
  persistedSplits: readonly CompletedKmSplit[] | null;
  quality: PersistedGpsQuality;
  currentSegment?: number;
  guidedPhase?: GuidedPhaseView | null;
  refreshHealth?: MetricsRefreshHealth;
}): LiveRunMetrics {
  const supportedEdges = input.metricVersion >= 2 ? input.edges ?? [] : null;
  const lastEdge = supportedEdges?.at(-1) ?? null;
  const completed = input.metricVersion >= 2 ? input.persistedSplits ?? completedKmSplits(input.sessionId, supportedEdges ?? []) : null;
  const lastSplit = completed?.at(-1) ?? null;
  const distance = input.distanceMeters;
  const partialDistance = distance === null ? null : Math.max(0, distance - (lastSplit?.kilometre ?? 0) * 1000);
  const partialStartsAt = (lastSplit?.kilometre ?? 0) * 1000;
  const partialHasGap = supportedEdges?.some(edge => edge.kind === 'gap' && edge.cumulativeDistanceMeters >= partialStartsAt) ?? false;
  const refreshHealth: MetricsRefreshHealth = input.refreshHealth ?? {
    status: 'current', lastAttemptMs: null, lastSuccessMs: null, snapshotCheckpointAtMs: null, snapshotAgeMs: null, errorStage: null, errorCode: null,
  };
  // A failed/stale persisted read may leave the timer moving while distance is
  // frozen. Keep the last distance visible, but never turn that mismatch into
  // a plausible-looking average pace.
  const paceIsTrustworthy = !['recovering', 'failed', 'stale'].includes(refreshHealth.status);
  return {
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    metricVersion: input.metricVersion,
    observedAtMs: input.observedAtMs,
    activeElapsedMs: input.activeElapsedMs,
    distanceMeters: distance,
    averagePaceSecPerKm: paceIsTrustworthy ? averagePaceSecondsPerKm(distance, input.activeElapsedMs / 1000) : null,
    rollingPaceSecPerKm: supportedEdges && paceIsTrustworthy ? rollingPaceFromEdges(supportedEdges, input.observedAtMs, input.recordingState, input.currentSegment) : null,
    completedKmSplits: completed,
    currentPartialKm: partialDistance === null || !lastEdge ? null : {
      kilometre: (lastSplit?.kilometre ?? 0) + 1,
      distanceMeters: partialDistance,
      activeElapsedMs: Math.max(0, input.activeElapsedMs - (lastSplit?.crossingActiveMs ?? 0)),
      gpsCoverage: partialHasGap ? 'gaps' : 'continuous',
    },
    gpsQuality: input.quality,
    recordingState: input.recordingState,
    lastAcceptedLocationTimestampMs: input.quality.lastAcceptedTimestampMs,
    guidedPhase: input.guidedPhase ?? null,
    refreshHealth,
  };
}
