import returnPolicyJson from '../../../PolicyPack/half_marathon/08_return_to_running_evidence_policy_v0.1.0_draft.json';
import type { CurrentTrainingStatus, InterruptionReason, InterruptionStatus } from '@/domain/assessment/types';
import type { DateOnly } from '@/domain/calendar/dateOnly';

type ReturnPolicy = { policy_id: string; version: string; review_status: 'draft'; release_gate: { can_activate: false }; rules: Record<string, string>; validation_cases: readonly string[] };
const policy = returnPolicyJson as ReturnPolicy;

export type HalfMarathonReadinessState = 'ready_for_supported_preparation' | 'returning_after_break' | 'first_time_runner' | 'insufficient_current_evidence' | 'health_review_required';
export type HalfMarathonReturnReadinessInput = {
  currentTrainingStatus: CurrentTrainingStatus;
  lastRunningDate: DateOnly | null;
  interruptionReason: InterruptionReason;
  interruption: InterruptionStatus;
  healthConcern: boolean;
  currentCapabilityConfirmedAt: DateOnly | null;
  historical: { weeklyMinutes: number | null; longestSessionMinutes: number | null; comfortableRunMinutes: number | null; weeklyObservationDate: DateOnly | null; longestSessionDate: DateOnly | null };
};
export type HalfMarathonReturnReadiness = {
  researchOnly: true;
  productionEligible: false;
  policyReference: string;
  state: HalfMarathonReadinessState;
  reasonCodes: readonly string[];
  nextAction: 'continue_to_authored_preparation_assessment' | 'review_current_running_information' | 'return_to_running_policy_required' | 'foundation_building_policy_required' | 'health_review';
  context: { currentTrainingStatus: CurrentTrainingStatus; lastRunningDate: DateOnly | null; interruptionReason: InterruptionReason };
  /** Facts remain available for explanation; they are not automatically current workload baselines. */
  historicalCapability: HalfMarathonReturnReadinessInput['historical'];
  currentCapability: { confirmedAt: DateOnly | null; eligibleForPreparationAssessment: boolean };
};

/**
 * Separates historical evidence from a runner's declared current capacity.
 * It deliberately has no time-away threshold or numerical detraining formula.
 */
export function assessHalfMarathonReturnReadiness(input: HalfMarathonReturnReadinessInput): HalfMarathonReturnReadiness {
  const base = { researchOnly: true as const, productionEligible: false as const, policyReference: `${policy.policy_id}@${policy.version}`, historicalCapability: input.historical, context: { currentTrainingStatus: input.currentTrainingStatus, lastRunningDate: input.lastRunningDate, interruptionReason: input.interruptionReason } };
  if (input.healthConcern || input.interruption === 'health_related' || input.interruptionReason === 'illness_or_injury') return { ...base, state: 'health_review_required', reasonCodes: ['health_review_required'], nextAction: 'health_review', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: false } };
  if (input.currentTrainingStatus === 'returning_after_break') return { ...base, state: 'returning_after_break', reasonCodes: ['return_to_running_pathway_not_authored'], nextAction: 'return_to_running_policy_required', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: false } };
  if (input.currentTrainingStatus === 'first_time_runner') return { ...base, state: 'first_time_runner', reasonCodes: ['foundation_building_pathway_not_authored'], nextAction: 'foundation_building_policy_required', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: false } };
  if (input.currentTrainingStatus !== 'currently_training') return { ...base, state: 'insufficient_current_evidence', reasonCodes: ['current_training_context_unknown'], nextAction: 'review_current_running_information', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: false } };
  if (!input.currentCapabilityConfirmedAt) return { ...base, state: 'insufficient_current_evidence', reasonCodes: ['current_capacity_not_confirmed'], nextAction: 'review_current_running_information', currentCapability: { confirmedAt: null, eligibleForPreparationAssessment: false } };
  if (input.historical.weeklyMinutes === null || input.historical.longestSessionMinutes === null || input.historical.comfortableRunMinutes === null) return { ...base, state: 'insufficient_current_evidence', reasonCodes: ['current_capacity_facts_incomplete'], nextAction: 'review_current_running_information', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: false } };
  return { ...base, state: 'ready_for_supported_preparation', reasonCodes: ['current_capacity_explicitly_confirmed'], nextAction: 'continue_to_authored_preparation_assessment', currentCapability: { confirmedAt: input.currentCapabilityConfirmedAt, eligibleForPreparationAssessment: true } };
}

export function validateHalfMarathonReturnReadinessPolicy() {
  const issues: string[] = [];
  if (policy.version !== '0.1.0-draft' || policy.release_gate.can_activate || policy.review_status !== 'draft') issues.push('draft_release_gate_invalid');
  if (!policy.rules.returning || !policy.rules.first_time || !policy.rules.current_baseline) issues.push('return_readiness_rules_incomplete');
  return issues;
}
