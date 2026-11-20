import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import type { Beginner5kPersonalizationInput } from '@/domain/planning/selectBeginner5kPathway';
import { isDateOnly } from '@/domain/calendar/dateOnly';

/** The only profile shape System A exposes to a planner or local model. */
export function buildSystemAPlanningInput(draft: FitnessAssessmentDraft, assessment: FitnessAssessmentResult) {
  if (assessment.code !== 'eligible_for_policy_selection') throw new Error(`Planning is unavailable: ${assessment.code}.`);
  return {
    assessmentVersion: assessment.version, assessmentFingerprint: assessment.inputFingerprint,
    classification: assessment.classification, confidence: assessment.confidence,
    runner: { weeklyDistance: numberOrNull(draft.weeklyDistance), weeklyDistanceUnit: draft.weeklyDistanceUnit, weeklyMinutes: numberOrNull(draft.weeklyMinutes), historyDays: numberOrNull(draft.historyDays), longestSessionMinutes: numberOrNull(draft.longestSessionMinutes), longestSessionDate: draft.longestSessionDate || null, comfortableRunMinutes: numberOrNull(draft.comfortableRunMinutes), interruption: draft.interruption },
    goal: { type: draft.goal, focus: draft.goalFocus, targetTimeSeconds: numberOrNull(draft.targetTimeSeconds), date: draft.goalDateFixed ? draft.goalDate || null : null },
    availability: { weekdays: [...draft.trainingDays], maxSessionMinutesByWeekday: Object.fromEntries(draft.trainingDays.map((day) => [day, numberOrNull(draft.minuteLimits[day] ?? '')])), preferredLongDay: draft.preferredLongDay, unavailableDates: draft.unavailableDates.split(',').map((item) => item.trim()).filter(Boolean) },
    provenance: { onboarding: 'user_direct', stravaExcluded: true },
  };
}
function numberOrNull(value: string): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }

/** Maps only user-entered facts to the first-5K selector; it does not assess medical fitness or calculate workload. */
export function buildFirst5kPersonalizationInput(draft: FitnessAssessmentDraft): Beginner5kPersonalizationInput {
  return {
    adultAgeConfirmed: draft.adultAgeConfirmed,
    canWalk30MinutesComfortably: draft.canWalk30MinutesComfortably,
    experience: draft.first5kExperience,
    healthConcern: draft.healthConcern || draft.interruption === 'health_related',
    interruption: draft.interruption,
    goal: draft.goal === '5k' ? 'first_5k_completion' : draft.goal === 'habit' ? 'other' : 'other',
    goalFocus: draft.goalFocus === 'finish' ? 'completion' : draft.goalFocus === 'target_time' ? 'target_time' : 'unknown',
    planStartDate: isDateOnly(draft.planStartDate) ? draft.planStartDate : null,
    availableDays: [...draft.trainingDays],
    continuousRunMinutes: numberOrNull(draft.comfortableRunMinutes),
    weeklyRunningMinutes: numberOrNull(draft.weeklyMinutes),
    weeklyDistance: numberOrNull(draft.weeklyDistance),
    longestRecentSessionMinutes: numberOrNull(draft.longestSessionMinutes),
    weekdayMinuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, numberOrNull(draft.minuteLimits[day] ?? '')])),
  };
}
