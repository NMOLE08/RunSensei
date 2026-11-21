import type { FitnessAssessmentDraft, FitnessAssessmentResult } from './types';
import type { PlanSnapshot } from '@/domain/training/entities';
import type { consumerPlanStatus } from '@/application/consumerPlanStatus';

export type PlanAvailabilityReason =
  | 'onboarding_not_started'
  | 'assessment_not_submitted'
  | 'assessment_needs_information'
  | 'assessment_health_hold'
  | 'assessment_needs_reassessment'
  | 'unsupported_two_day_schedule'
  | 'unsupported_training_schedule'
  | 'unsupported_goal_or_pathway'
  | 'marathon_event_programme_not_authored'
  | 'draft_policy_not_release_ready'
  | 'no_active_plan';

export type PlanAvailability = {
  consumerStatus?: ReturnType<typeof consumerPlanStatus>;
  state: 'onboarding_incomplete' | 'assessment_pending' | 'assessment_unavailable' | 'plan_unavailable' | 'active_approved';
  profileSaved: boolean;
  reasons: readonly PlanAvailabilityReason[];
  trainingDays: readonly number[];
  assessment: FitnessAssessmentResult | null;
  activeSnapshot: PlanSnapshot | null;
};

/**
 * Presentation status only. It never selects, generates, or activates a
 * prescription, and it deliberately leaves policy release gates intact.
 */
export function evaluatePlanAvailability(input: { draft: FitnessAssessmentDraft | null; assessment: FitnessAssessmentResult | null; activeSnapshot: PlanSnapshot | null }): PlanAvailability {
  const draft = input.draft; const assessment = input.assessment; const trainingDays = draft?.trainingDays ?? [];
  if (input.activeSnapshot?.plan.mode === 'real' && input.activeSnapshot.plan.recommendationState === 'active') return { state: 'active_approved', profileSaved: true, reasons: [], trainingDays, assessment: input.assessment, activeSnapshot: input.activeSnapshot };
  if (!draft) return { state: 'onboarding_incomplete', profileSaved: false, reasons: ['onboarding_not_started'], trainingDays, assessment: null, activeSnapshot: null };
  if (!assessment) return { state: 'assessment_pending', profileSaved: true, reasons: ['assessment_not_submitted'], trainingDays, assessment: null, activeSnapshot: null };
  const assessedInput = { draft, assessment };
  if (assessment.code === 'insufficient_information') return unavailable(assessedInput, ['assessment_needs_information']);
  if (assessment.code === 'health_hold') return unavailable(assessedInput, ['assessment_health_hold']);
  if (assessment.code === 'needs_reassessment' || assessment.code === 'needs_base_build') return unavailable(assessedInput, ['assessment_needs_reassessment']);
  const reasons: PlanAvailabilityReason[] = [];
  if (trainingDays.length === 2) reasons.push('unsupported_two_day_schedule');
  else if (trainingDays.length < 3 || !hasThreeNonConsecutiveDays(trainingDays)) reasons.push('unsupported_training_schedule');
  if (draft.goal === 'marathon') reasons.push('marathon_event_programme_not_authored');
  else if (draft.goal !== '5k' || draft.first5kExperience === 'unknown') reasons.push('unsupported_goal_or_pathway');
  // The bundled first-5K content is draft-only. This always remains visible
  // separately from any availability limitation.
  reasons.push('draft_policy_not_release_ready', 'no_active_plan');
  return unavailable(assessedInput, reasons);
}

function unavailable(input: { draft: FitnessAssessmentDraft; assessment: FitnessAssessmentResult }, reasons: readonly PlanAvailabilityReason[]): PlanAvailability {
  return { state: 'plan_unavailable', profileSaved: true, reasons, trainingDays: input.draft.trainingDays, assessment: input.assessment, activeSnapshot: null };
}

function hasThreeNonConsecutiveDays(days: readonly number[]): boolean {
  const unique = [...new Set(days)].sort((left, right) => left - right);
  if (unique.length < 3) return false;
  for (let first = 0; first < unique.length; first += 1) for (let second = first + 1; second < unique.length; second += 1) for (let third = second + 1; third < unique.length; third += 1) {
    const selected = [unique[first], unique[second], unique[third]];
    if (selected.every((day, index) => ((selected[(index + 1) % 3] - day + 7) % 7) >= 2)) return true;
  }
  return false;
}
