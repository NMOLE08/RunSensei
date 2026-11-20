import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { TrackerHistoryItem } from '@/application/trackerHistory';
import type { ActivityLog } from '@/domain/training/entities';
import { fingerprint } from '@/domain/context';

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

export type PersonalizedRunnerContext = {
  fingerprint: string;
  runner: Record<string, unknown>;
  goal: { kind: string; distanceMeters: number | null; targetTimeSeconds: number | null; raceDate: string | null };
  trainingState: { phase: string; weekNumber: number; recentLoad: Record<string, unknown>; previousOutcomes: Record<string, unknown>[] };
  paceEvidence: { reliable: boolean; source: 'runsensei_native' | 'user_reported' | 'none'; referenceSecondsPerKm: number | null };
};

/** Strict allowlist for local inference. Raw coordinates, identity data, and Strava provenance never enter this object. */
export function buildPersonalizedRunnerContext(draft: OnboardingDraft, runs: TrackerHistoryItem[], outcomes: ActivityLog[], options: { nowIso: string; phase: string; weekNumber: number }): PersonalizedRunnerContext {
  if (draft.baselineWeeks.some((week) => week.distance.origin === 'strava_api' || week.durationMinutes.origin === 'strava_api') || draft.currentPerformance?.origin === 'strava_api' || outcomes.some((outcome) => /strava/i.test(outcome.source))) throw new Error('Strava-origin information is not permitted in local AI planning.');
  const nativeRuns = runs.filter((run) => run.mode === 'run');
  const usablePaceRuns = nativeRuns.filter((run) => run.gps && run.distanceMeters !== null && run.distanceMeters >= 1000 && run.activeSeconds > 0);
  const totalDistance = usablePaceRuns.reduce((sum, run) => sum + (run.distanceMeters ?? 0), 0);
  const totalSeconds = usablePaceRuns.reduce((sum, run) => sum + run.activeSeconds, 0);
  const referencePace = usablePaceRuns.length >= 2 && totalDistance > 0 ? Math.round(totalSeconds / (totalDistance / 1000)) : null;
  const recentNativeRuns = nativeRuns.slice(0, 20).map((run) => ({ date: new Date(run.startedAtMs).toISOString().slice(0, 10), activeSeconds: Math.round(run.activeSeconds), distanceMeters: run.distanceMeters, gpsAccepted: run.gps }));
  const previousOutcomes = outcomes.slice(-20).map((outcome) => ({ date: outcome.actualDate, durationSeconds: outcome.durationSeconds, distanceMeters: outcome.distanceMeters, intendedEffort: outcome.intendedEffort, reportedEffort: outcome.reportedEffort, reasons: safeJsonArray(outcome.reasonsJson), concernFlags: safeJsonArray(outcome.concernFlagsJson), source: outcome.source === 'gps' ? 'runsensei_native' : 'user_reported' }));
  const baselineWeeks = draft.baselineWeeks.map((week) => ({ startDate: week.startDate || null, endDate: week.endDate || null, distance: allowedValue(week.distance), durationMinutes: allowedValue(week.durationMinutes), gapReason: week.gapReason || null }));
  const runner = {
    timezone: draft.timezone, units: draft.units, experienceCategory: draft.experienceCategory, runningExperienceMonths: positive(draft.runningExperienceMonths), recentRunsPerWeek: positive(draft.recentRunsPerWeek),
    baselineWeeks, recentWeeklyMinutes: positive(draft.weeklyRunningMinutes), baselineLookbackDays: positive(draft.baselineLookbackDays), longestRepeatableSessionMinutes: positive(draft.longestSessionMinutes), longestSessionDate: draft.longestSessionDate || null, comfortableDurationMinutes: positive(draft.comfortableDurationMinutes), interruption: draft.recentInterruption,
    currentPerformance: draft.currentPerformance && draft.currentPerformance.confirmedByUser ? { distanceMeters: positive(draft.currentPerformance.distanceMeters), timeSeconds: positive(draft.currentPerformance.timeSeconds), date: draft.currentPerformance.date, source: draft.currentPerformance.origin } : null,
    preferences: { volume: draft.volumePreference, difficulty: draft.difficultyPreference, workouts: [...draft.workoutPreferences], weeklyTimeCapMinutes: positive(draft.weeklyTimeCapMinutes), longestRunCapMinutes: positive(draft.longestRunCapMinutes) }, recentNativeRuns,
  };
  const goal = { kind: draft.goalKind, distanceMeters: Number.isFinite(Number(draft.goalDistance)) ? Number(draft.goalDistance) : null, targetTimeSeconds: positive(draft.targetPerformanceSeconds), raceDate: draft.goalMode === 'fixed_date' ? draft.raceDate || null : null };
  const recentLoad = { nativeRunCount: nativeRuns.length, nativeActiveMinutes: Math.round(nativeRuns.reduce((sum, run) => sum + run.activeSeconds, 0) / 60), nativeDistanceMeters: nativeRuns.some((run) => run.distanceMeters !== null) ? Math.round(nativeRuns.reduce((sum, run) => sum + (run.distanceMeters ?? 0), 0)) : null };
  const trainingState = { phase: options.phase, weekNumber: options.weekNumber, recentLoad, previousOutcomes };
  const paceEvidence = { reliable: referencePace !== null, source: referencePace !== null ? 'runsensei_native' as const : 'none' as const, referenceSecondsPerKm: referencePace };
  return { fingerprint: fingerprint({ runner, goal, trainingState, paceEvidence, generatedFor: options.nowIso.slice(0, 10) }), runner, goal, trainingState, paceEvidence };
}

function allowedValue(value: OnboardingDraft['baselineWeeks'][number]['distance']) { return { value: value.value, source: value.origin === 'runsensei_native' ? 'runsensei_native' : value.origin === 'unknown' ? 'unknown' : 'user_reported', observedAt: value.observedAt, quality: value.quality, confirmedByUser: value.confirmedByUser }; }
function safeJsonArray(value: string): unknown[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
