import { buildRunnerProfile } from '@/ai/services/RunnerProfileBuilder';
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
});
