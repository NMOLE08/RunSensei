import type { PolicyEvidence, PolicyLifecycle } from '@/domain/training/policyReviewCatalog';
import policyJson from '../../../PolicyPack/10_beginner_5k_personalization_policy.json';
import policyV03Json from '../../../PolicyPack/11_beginner_5k_personalization_policy_v0.3.0_draft.json';

/**
 * Governance contract for choosing an approved beginner-5K pathway.
 * It deliberately names rules rather than embedding workload formulas.
 */
export type Beginner5kPersonalizationInputKey =
  | 'adult_age_confirmed'
  | 'can_walk_30_minutes_comfortably'
  | 'first_5k_experience'
  | 'health_concern'
  | 'goal'
  | 'goal_focus'
  | 'plan_start_date'
  | 'available_training_days';

export type ImmutablePolicyReference = { policyId: string; version: string };
export type WorkoutPolicyPackReference = ImmutablePolicyReference & { policyReferences: readonly string[] };
export type Beginner5kRuleReference = {
  id: string;
  status: 'defined' | 'requires_review';
  description: string;
};

export type Beginner5kPathway = {
  id: string;
  version: string;
  label: string;
  requiredInputs: readonly Beginner5kPersonalizationInputKey[];
  supportedExperience: readonly ('none_or_limited' | 'substantial')[];
  supportedGoal: 'first_5k_completion';
  supportedGoalFocus: 'completion';
  workoutPolicyPack: WorkoutPolicyPackReference;
  selectionRuleIds: readonly string[];
  startingWorkloadRuleId: string;
  progressionRuleIds: readonly string[];
  recoveryRuleIds: readonly string[];
  schedulingRuleIds: readonly string[];
};

export type Beginner5kPersonalizationPolicy = {
  schemaVersion: 'beginner-5k-personalization-policy-v1';
  policyId: string;
  version: string;
  lifecycle: PolicyLifecycle;
  goal: 'first_5k_completion';
  eligibility: { requiredInputs: readonly Beginner5kPersonalizationInputKey[]; healthConcernBlocksSelection: true };
  pathways: readonly Beginner5kPathway[];
  pathwaySelectionRules: readonly Beginner5kRuleReference[];
  startingWorkloadRules: readonly Beginner5kRuleReference[];
  progressionRules: readonly Beginner5kRuleReference[];
  recoveryAndInterruptionRules: readonly Beginner5kRuleReference[];
  schedulingRules: readonly Beginner5kRuleReference[];
  evidence: readonly PolicyEvidence[];
  reviewer: string | null;
  reviewDate: string | null;
  approvalScope: string | null;
  releaseEligibility: 'blocked' | 'eligible_after_release_review';
  validationCaseIds: readonly string[];
};

/**
 * This JSON is source-controlled policy content. Validation deliberately
 * rejects missing references rather than turning a partial file into advice.
 */
export function validateBeginner5kPersonalizationPolicy(policy: Beginner5kPersonalizationPolicy): string[] {
  const reasons: string[] = [];
  if (policy.schemaVersion !== 'beginner-5k-personalization-policy-v1') reasons.push('unsupported_schema');
  if (!policy.policyId || !policy.version) reasons.push('missing_policy_identity');
  if (policy.goal !== 'first_5k_completion') reasons.push('unsupported_goal');
  if (policy.lifecycle !== 'draft' || policy.releaseEligibility !== 'blocked') reasons.push('draft_release_gate_invalid');
  if (!policy.pathways.length) reasons.push('missing_pathway');
  for (const pathway of policy.pathways) {
    if (!pathway.id || !pathway.version || !pathway.startingWorkloadRuleId) reasons.push(`invalid_pathway:${pathway.id || 'unknown'}`);
    if (!policy.startingWorkloadRules.some((rule) => rule.id === pathway.startingWorkloadRuleId)) reasons.push(`missing_starting_workload_rule:${pathway.id}`);
    if (!pathway.workoutPolicyPack.policyId || !pathway.workoutPolicyPack.version || !pathway.workoutPolicyPack.policyReferences.length) reasons.push(`missing_workout_policy_reference:${pathway.id}`);
    if (new Set(pathway.workoutPolicyPack.policyReferences).size !== pathway.workoutPolicyPack.policyReferences.length) reasons.push(`duplicate_workout_policy_reference:${pathway.id}`);
  }
  if (!policy.pathwaySelectionRules.some((rule) => rule.status === 'defined')) reasons.push('no_selectable_pathway_rule');
  if (!policy.evidence.length) reasons.push('missing_evidence');
  return reasons;
}

export const first5kFixedBaselinePersonalizationPolicy = policyJson as unknown as Beginner5kPersonalizationPolicy;
export const beginner5kContinuousCandidatePersonalizationPolicy = policyV03Json as unknown as Beginner5kPersonalizationPolicy;

export const bundledBeginner5kPersonalizationPolicies = [first5kFixedBaselinePersonalizationPolicy, beginner5kContinuousCandidatePersonalizationPolicy] as const;
