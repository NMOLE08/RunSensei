import policyJson from '../../../PolicyPack/13_beginner_5k_adaptation_v0.1.0_draft.json';

export type AdaptationDecision = 'advance_candidate' | 'repeat_candidate' | 'reduce_candidate' | 'maintain_candidate' | 'hold_for_review' | 'insufficient_evidence' | 'policy_gap';
export type Beginner5kAdaptationPolicy = { schemaVersion: 'beginner-5k-adaptation-policy-v1'; policyId: string; version: string; lifecycle: 'draft' | 'reviewed' | 'retired'; releaseEligibility: 'blocked' | 'eligible_after_release_review'; decisionPrecedence: readonly string[]; reviewer: string | null; reviewDate: string | null; approvalScope: string | null; safetyConstraints: { neverMakeUpMissedWork: true; neverInferSuccessFromMissingData: true; neverChangePlan: true; healthHoldOverridesAll: true; requiresReviewedNumericalRulesForProposalRequest: true } };
export const beginner5kAdaptationV01 = policyJson as unknown as Beginner5kAdaptationPolicy;
export function validateBeginner5kAdaptationPolicy(policy: Beginner5kAdaptationPolicy): string[] {
  const reasons: string[] = [];
  if (policy.schemaVersion !== 'beginner-5k-adaptation-policy-v1' || !policy.policyId || !policy.version) reasons.push('invalid_policy_identity');
  if (policy.lifecycle !== 'draft' || policy.releaseEligibility !== 'blocked') reasons.push('draft_release_gate_invalid');
  if (!policy.safetyConstraints.neverChangePlan || !policy.safetyConstraints.healthHoldOverridesAll || !policy.safetyConstraints.requiresReviewedNumericalRulesForProposalRequest) reasons.push('safety_boundary_missing');
  return reasons;
}
