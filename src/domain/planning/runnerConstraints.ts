import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import { isDateOnly, type DateOnly } from '@/domain/calendar/dateOnly';

export type RunnerDayConstraint = { weekday: number; maxMinutes: number | null; confirmedByRunner: boolean };
export type NormalizedRunnerConstraints = {
  schemaVersion: 'runner-constraints-v1';
  ownerId: string;
  safety: { healthConcern: boolean; interruption: FitnessAssessmentDraft['interruption']; adultAgeConfirmed: boolean | null; canWalk30MinutesComfortably: boolean | null };
  fitnessEvidence: { comfortableRunMinutes: number | null; weeklyRunningMinutes: number | null; weeklyDistance: number | null; weeklyDistanceUnit: 'km' | 'mi'; longestRecentSessionMinutes: number | null; longestSessionDate: string | null; performanceReliable: boolean };
  scheduling: { requestedStartDate: DateOnly | null; weekAnchor: DateOnly | null; availableDays: readonly RunnerDayConstraint[]; unavailableDates: readonly DateOnly[]; preferredLongDay: number | null };
  goal: { family: 'first_5k_completion' | 'unsupported'; sourceGoal: FitnessAssessmentDraft['goal']; focus: FitnessAssessmentDraft['goalFocus']; fixedDate: DateOnly | null };
};

export function normalizeRunnerConstraints(draft: FitnessAssessmentDraft): NormalizedRunnerConstraints {
  const requestedStartDate = isDateOnly(draft.planStartDate) ? draft.planStartDate : null;
  return {
    schemaVersion: 'runner-constraints-v1', ownerId: draft.ownerId,
    safety: { healthConcern: draft.healthConcern, interruption: draft.interruption, adultAgeConfirmed: draft.adultAgeConfirmed, canWalk30MinutesComfortably: draft.canWalk30MinutesComfortably },
    fitnessEvidence: { comfortableRunMinutes: positive(draft.comfortableRunMinutes), weeklyRunningMinutes: positive(draft.weeklyMinutes), weeklyDistance: positive(draft.weeklyDistance), weeklyDistanceUnit: draft.weeklyDistanceUnit, longestRecentSessionMinutes: positive(draft.longestSessionMinutes), longestSessionDate: isDateOnly(draft.longestSessionDate) ? draft.longestSessionDate : null, performanceReliable: draft.performanceQuality === 'reliable' },
    scheduling: {
      requestedStartDate, weekAnchor: requestedStartDate ? nextMondayOnOrAfter(requestedStartDate) : null,
      availableDays: [...new Set(draft.trainingDays)].sort((a, b) => a - b).map((day) => ({ weekday: day, maxMinutes: positive(draft.minuteLimits[day] ?? ''), confirmedByRunner: draft.minuteLimitConfirmedDays.includes(day) })),
      unavailableDates: draft.unavailableDates.split(',').map((item) => item.trim()).filter(isDateOnly), preferredLongDay: draft.preferredLongDay,
    },
    goal: { family: draft.goal === '5k' && draft.goalFocus === 'finish' ? 'first_5k_completion' : 'unsupported', sourceGoal: draft.goal, focus: draft.goalFocus, fixedDate: draft.goalDateFixed && isDateOnly(draft.goalDate) ? draft.goalDate : null },
  };
}

/** The immutable draft simulators take a Monday anchor. Never moves backward. */
export function nextMondayOnOrAfter(date: DateOnly): DateOnly { return addCalendarDays(date, (7 - weekday(date)) % 7); }
function positive(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
