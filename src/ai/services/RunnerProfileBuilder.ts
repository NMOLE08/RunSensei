import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { TrackerHistoryItem } from '@/application/trackerHistory';

export type NormalizedRunnerProfile = {
  schemaVersion: 'local-runner-profile-v1'; generatedAt: string; timezone: string; units: 'metric' | 'imperial';
  goal: { distanceMeters: number; mode: string; raceDate: string | null };
  availability: { weekdays: number[]; minuteLimits: Record<number, number | null> };
  baseline: { lookbackDays: number | null; selfReportedWeeklyMinutes: number | null; selfReportedLongestSeconds: number | null; comfortableSeconds: number | null; interruption: string; nativeRunCount: number; nativeWeeklyDistanceMeters: number | null; nativeLongestDistanceMeters: number | null; nativeAveragePaceSecondsPerKm: number | null };
  safety: { concern: boolean };
  provenance: { onboarding: 'user_direct'; nativeRuns: 'runsensei_native'; stravaExcluded: true };
};
const positive = (value: string): number | null => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };

export function buildRunnerProfile(draft: OnboardingDraft, runs: TrackerHistoryItem[], nowIso: string): NormalizedRunnerProfile {
  const lookbackDays = positive(draft.baselineLookbackDays); const cutoff = lookbackDays ? Date.parse(nowIso) - lookbackDays * 86_400_000 : Number.NEGATIVE_INFINITY;
  const nativeRuns = runs.filter((run) => run.mode === 'run' && run.startedAtMs >= cutoff); const distances = nativeRuns.map((run) => run.distanceMeters).filter((value): value is number => value !== null && value > 0);
  const totalDistance = distances.reduce((sum, value) => sum + value, 0); const totalActive = nativeRuns.reduce((sum, run) => sum + (run.distanceMeters ? run.activeSeconds : 0), 0);
  return { schemaVersion: 'local-runner-profile-v1', generatedAt: nowIso, timezone: draft.timezone, units: draft.units,
    goal: { distanceMeters: Number(draft.goalDistance), mode: draft.goalMode, raceDate: draft.raceDate || null },
    availability: { weekdays: [...draft.trainingDays].sort((a, b) => a - b), minuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, positive(draft.minuteLimits[day] ?? '')])) },
    baseline: { lookbackDays, selfReportedWeeklyMinutes: positive(draft.weeklyRunningMinutes), selfReportedLongestSeconds: positive(draft.longestSessionMinutes) === null ? null : positive(draft.longestSessionMinutes)! * 60, comfortableSeconds: positive(draft.comfortableDurationMinutes) === null ? null : positive(draft.comfortableDurationMinutes)! * 60, interruption: draft.recentInterruption, nativeRunCount: nativeRuns.length, nativeWeeklyDistanceMeters: lookbackDays && distances.length ? Math.round(totalDistance / lookbackDays * 7) : null, nativeLongestDistanceMeters: distances.length ? Math.max(...distances) : null, nativeAveragePaceSecondsPerKm: totalDistance > 0 && totalActive > 0 ? Math.round(totalActive / (totalDistance / 1000)) : null },
    safety: { concern: draft.concernFlag }, provenance: { onboarding: 'user_direct', nativeRuns: 'runsensei_native', stravaExcluded: true } };
}
