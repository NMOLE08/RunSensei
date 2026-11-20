import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import { nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import type { GoalFamily, MultiDistanceRunnerConstraints as GenericConstraints } from '@/domain/planning/multiDistancePolicy';
import { isDateOnly } from '@/domain/calendar/dateOnly';

export type MultiDistancePlanningInput = { kind: 'ready'; goalFamily: GoalFamily; goalFocus: FitnessAssessmentDraft['goalFocus']; constraints: GenericConstraints; evidence: { weeklyMinutes: number | null; longestSessionMinutes: number | null; comfortableRunMinutes: number | null; classification: FitnessAssessmentResult['classification']; confidence: FitnessAssessmentResult['confidence'] } } | { kind: 'blocked'; reasonCodes: readonly string[] };

/** Maps authenticated onboarding evidence into policy-neutral constraints; it does not prescribe a workload. */
export function buildMultiDistancePlanningInput(draft: FitnessAssessmentDraft, assessment: FitnessAssessmentResult): MultiDistancePlanningInput {
  if (assessment.code !== 'eligible_for_policy_selection') return { kind: 'blocked', reasonCodes: [`assessment_${assessment.code}`] };
  if (draft.healthConcern || draft.interruption === 'health_related') return { kind: 'blocked', reasonCodes: ['health_hold'] };
  if (!isDateOnly(draft.planStartDate)) return { kind: 'blocked', reasonCodes: ['invalid_plan_start_date'] };
  const goalFamily = goalFamilyFor(draft.goal); if (!goalFamily) return { kind: 'blocked', reasonCodes: ['goal_policy_family_not_authored'] };
  const availability = [...new Set(draft.trainingDays)].sort((a, b) => a - b).map((weekday) => ({ weekday, maxMinutes: positive(draft.minuteLimits[weekday] ?? ''), confirmedByRunner: draft.minuteLimitConfirmedDays.includes(weekday) }));
  if (!availability.length) return { kind: 'blocked', reasonCodes: ['missing_availability'] };
  return { kind: 'ready', goalFamily, goalFocus: draft.goalFocus, constraints: { ownerId: draft.ownerId, goalFamily, startDate: nextMondayOnOrAfter(draft.planStartDate), fixedGoalDate: draft.goalDateFixed && isDateOnly(draft.goalDate) ? draft.goalDate : null, availableDays: availability, unavailableDates: draft.unavailableDates.split(',').map((item) => item.trim()).filter(isDateOnly), preferredLongRunDay: draft.preferredLongDay }, evidence: { weeklyMinutes: positive(draft.weeklyMinutes), longestSessionMinutes: positive(draft.longestSessionMinutes), comfortableRunMinutes: positive(draft.comfortableRunMinutes), classification: assessment.classification, confidence: assessment.confidence } };
}
function positive(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function goalFamilyFor(goal: FitnessAssessmentDraft['goal']): GoalFamily | null { return goal === '5k' ? '5k' : goal === '10k' ? '10k' : goal === 'half_marathon' ? 'half_marathon' : goal === 'marathon' ? 'marathon' : null; }
