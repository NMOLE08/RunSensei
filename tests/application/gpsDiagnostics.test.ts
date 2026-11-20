import { GPS_DIAGNOSTIC_EVENT_CAPACITY, GPS_DIAGNOSTIC_QUEUE_CAPACITY, reduceGpsDiagnosticSummary, type GpsDiagnosticEvent, type GpsDiagnosticSummary } from '@/application/gpsDiagnostics';

const location = (index: number, accepted = true): GpsDiagnosticEvent => ({
  atMs: 1000 + index * 1000,
  kind: 'location',
  sessionStartedAtMs: 1000,
  observationTimestampMs: 1000 + index * 1000,
  processingTimestampMs: 1100 + index * 1000,
  processingDelayMs: 100,
  accuracyMeters: 8,
  accepted,
  rejectionReason: accepted ? null : 'jitter',
  committedDistanceIncrementMeters: accepted ? 3 : 0,
  cumulativeDistanceMeters: accepted ? index * 3 : Math.max(0, (index - 1) * 3),
});

describe('local GPS diagnostic summary', () => {
  it('retains whole-session counters independently from detailed-event eviction', () => {
    let summary: GpsDiagnosticSummary | null = null;
    for (let index = 0; index < 5000; index += 1) summary = reduceGpsDiagnosticSummary(summary, location(index, index % 5 !== 0));
    expect(summary).toMatchObject({ receivedObservations: 5000, acceptedObservations: 4000, rejectedObservations: 1000, committedMovementEdges: 4000 });
    expect(summary?.rejectionCounts.jitter).toBe(1000);
    expect(summary?.totalCommittedDistanceMeters).toBeGreaterThan(14000);
    expect(GPS_DIAGNOSTIC_EVENT_CAPACITY).toBeGreaterThanOrEqual(4096);
    expect(GPS_DIAGNOSTIC_QUEUE_CAPACITY).toBeLessThan(GPS_DIAGNOSTIC_EVENT_CAPACITY);
  });

  it('records refresh failures, permission precision, gaps and dropped evidence', () => {
    let summary = reduceGpsDiagnosticSummary(null, { atMs: 1000, kind: 'permission', permissionPrecision: 'approximate', sessionStartedAtMs: 1000 });
    summary = reduceGpsDiagnosticSummary(summary, { ...location(1), gap: true }, 3);
    summary = reduceGpsDiagnosticSummary(summary, { atMs: 3000, kind: 'refresh', refreshStatus: 'failed', refreshStage: 'evidence_read', refreshErrorCode: 'database_unavailable', snapshotAgeMs: 40000 });
    expect(summary).toMatchObject({ permissionPrecision: 'approximate', observationGapCount: 1, refreshAttempts: 1, refreshFailures: 1, maximumSnapshotAgeMs: 40000, eventsDropped: 3 });
  });
});
