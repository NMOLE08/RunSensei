import { buildPersonalizedRunnerContext, buildRunnerProfile } from '@/ai/services/RunnerProfileBuilder';
import { emptyDraft } from '@/domain/onboarding/types';

describe('local AI runner profile', () => {
  test('keeps missing values unknown and excludes walks from running metrics', () => {
    const draft = emptyDraft('Asia/Kolkata'); draft.goalDistance = '5000';
    const result = buildRunnerProfile(draft, [{ id: 'walk', mode: 'walk', startedAtMs: Date.parse('2026-10-30T10:00:00Z'), endedAtMs: Date.parse('2026-10-30T10:30:00Z'), activeSeconds: 1800, elapsedSeconds: 1800, distanceMeters: 2000, gps: true }], '2026-10-31T00:00:00Z');
    expect(result.baseline.selfReportedWeeklyMinutes).toBeNull(); expect(result.baseline.nativeRunCount).toBe(0); expect(result.baseline.nativeAveragePaceSecondsPerKm).toBeNull(); expect(result.provenance.stravaExcluded).toBe(true);
  });
  test('derives deterministic native-run distance and active-time pace', () => {
    const draft = emptyDraft('Asia/Kolkata'); draft.baselineLookbackDays = '28'; draft.weeklyRunningMinutes = '120'; draft.longestSessionMinutes = '45'; draft.comfortableDurationMinutes = '30';
    const runs = [{ id: 'run', mode: 'run' as const, startedAtMs: Date.parse('2026-10-28T10:00:00Z'), endedAtMs: Date.parse('2026-10-28T10:30:00Z'), activeSeconds: 1800, elapsedSeconds: 1800, distanceMeters: 5000, gps: true }];
    const result = buildRunnerProfile(draft, runs, '2026-10-31T00:00:00Z');
    expect(result.baseline.nativeRunCount).toBe(1); expect(result.baseline.nativeWeeklyDistanceMeters).toBe(1250); expect(result.baseline.nativeLongestDistanceMeters).toBe(5000); expect(result.baseline.nativeAveragePaceSecondsPerKm).toBe(360);
  });
  test('builds an allowlisted four-week context with prior outcomes and reliable native pace evidence', () => {
    const draft = emptyDraft('Asia/Kolkata'); draft.baselineWeeks[0].distance = { value: '12', origin: 'user_reported', observedAt: '2026-10-04', quality: 'medium', confirmedByUser: true };
    const runs = [1, 2].map((index) => ({ id: `run-${index}`, mode: 'run' as const, startedAtMs: Date.parse(`2026-10-${20 + index}T10:00:00Z`), endedAtMs: Date.parse(`2026-10-${20 + index}T10:30:00Z`), activeSeconds: 1800, elapsedSeconds: 1800, distanceMeters: 5000, gps: true }));
    const outcome = { id: 'log', previousVersionId: null, sessionId: 'session', actualDate: '2026-10-22' as const, durationSeconds: 1800, distanceMeters: 5000, intendedEffort: 'easy', reportedEffort: 'as expected', source: 'gps', reasonsJson: '[]', concernFlagsJson: '[]', createdAt: '2026-10-22T12:00:00Z' };
    const result = buildPersonalizedRunnerContext(draft, runs, [outcome], { nowIso: '2026-10-31T00:00:00Z', phase: 'base_build', weekNumber: 2 });
    expect(result.paceEvidence).toEqual({ reliable: true, source: 'runsensei_native', referenceSecondsPerKm: 360 }); expect(result.trainingState.previousOutcomes).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('latitude');
  });
  test('rejects Strava provenance rather than relabeling it', () => { const draft = emptyDraft('Asia/Kolkata'); draft.baselineWeeks[0].distance.origin = 'strava_api'; expect(() => buildPersonalizedRunnerContext(draft, [], [], { nowIso: '2026-10-31T00:00:00Z', phase: 'base_build', weekNumber: 1 })).toThrow(/Strava-origin/); });
});
