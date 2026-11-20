import { GPS_FILTER } from '@/domain/tracking/metrics';
import { activeMillisecondsAt } from '@/domain/tracking/session';
import { selectLiveRunMetrics, type GuidedPhaseView, type LiveRunMetrics } from '@/domain/tracking/liveRunMetrics';
import type { TrackerSnapshot } from './workoutTracker';
import { recordGpsDiagnostic, rollingDiagnosticEvent } from './gpsDiagnostics';

const lastPaceDiagnosticAt = new Map<string, number>();

/** One calculation path for standalone, planned and guided workout displays. */
export function liveRunMetrics(snapshot: TrackerSnapshot, observedAtMs: number, guidedPhase: GuidedPhaseView | null = null): LiveRunMetrics {
  const lastAccepted = snapshot.gpsQuality.lastAcceptedTimestampMs;
  const quality = snapshot.session.status === 'recording' && snapshot.gpsQuality.state !== 'acquiring' && snapshot.gpsQuality.state !== 'unavailable' && lastAccepted !== null && observedAtMs - lastAccepted > GPS_FILTER.smoothingWindowMs
    ? { ...snapshot.gpsQuality, state: 'stale' as const, reasonCodes: [...new Set([...snapshot.gpsQuality.reasonCodes, 'accepted_fix_stale'])] }
    : snapshot.gpsQuality;
  const snapshotAgeMs = snapshot.refreshHealth.lastSuccessMs === null ? null : Math.max(0, observedAtMs - snapshot.refreshHealth.lastSuccessMs);
  const refreshHealth = snapshot.session.status === 'recording' && !['failed', 'recovering', 'stale'].includes(snapshot.refreshHealth.status) && snapshotAgeMs !== null && snapshotAgeMs > GPS_FILTER.smoothingWindowMs
    ? { ...snapshot.refreshHealth, status: 'stale' as const, snapshotAgeMs }
    : { ...snapshot.refreshHealth, snapshotAgeMs };
  const metrics = selectLiveRunMetrics({
    sessionId: snapshot.session.id,
    ownerId: snapshot.session.ownerId,
    metricVersion: snapshot.session.metricVersion,
    observedAtMs,
    activeElapsedMs: activeMillisecondsAt(snapshot.session.segments, snapshot.session.status === 'paused' || snapshot.session.status === 'interrupted' ? snapshot.session.segments.at(-1)?.endedAtMs ?? observedAtMs : observedAtMs),
    distanceMeters: snapshot.session.distanceMeters,
    recordingState: snapshot.session.status,
    edges: snapshot.metricEdges,
    persistedSplits: snapshot.completedKmSplits,
    quality,
    currentSegment: Math.max(0, snapshot.session.segments.length - 1),
    guidedPhase,
    refreshHealth,
  });
  const lastDiagnostic = lastPaceDiagnosticAt.get(snapshot.session.id) ?? 0;
  if (snapshot.session.metricVersion >= 2 && observedAtMs - lastDiagnostic >= 5000) {
    lastPaceDiagnosticAt.set(snapshot.session.id, observedAtMs);
    const edges = snapshot.metricEdges ?? [];
    const lastEdge = edges.at(-1); const window = lastEdge ? edges.filter(edge => edge.segment === lastEdge.segment && lastEdge.observationTimestampMs - edge.observationTimestampMs <= GPS_FILTER.smoothingWindowMs) : [];
    const reason = metrics.rollingPaceSecPerKm !== null ? null : ['recovering', 'failed', 'stale'].includes(refreshHealth.status) ? 'refresh_untrustworthy' : metrics.recordingState !== 'recording' ? 'not_recording' : metrics.gpsQuality.state === 'stale' ? 'gps_stale' : 'insufficient_movement';
    recordGpsDiagnostic(snapshot.session.ownerId, snapshot.session.id, rollingDiagnosticEvent(window, observedAtMs, metrics.rollingPaceSecPerKm, reason));
  }
  return metrics;
}
