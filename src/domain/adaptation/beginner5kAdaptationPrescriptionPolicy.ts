import json from '../../../PolicyPack/14_beginner_5k_adaptation_prescription_v0.2.0_draft.json';

export type Beginner5kAdaptationPrescriptionPolicy = { schemaVersion: 'beginner-5k-adaptation-prescription-policy-v1'; policyId: string; version: string; lifecycle: 'draft' | 'reviewed' | 'retired'; releaseEligibility: 'blocked' | 'eligible_after_release_review'; safetyConstraints: { repeatOnlyExactAuthoredStage: true; repeatMayNotCopyEventWeek: true; neverDuplicateFinalEvent: true; fixedDateRepeatMustConflict: true; preserveHistoricalSessions: true; requireStructuralValidation: true; modifiedProgressionRequiresCoachReview: true; canActivate: false } };
export const beginner5kAdaptationPrescriptionV02 = json as unknown as Beginner5kAdaptationPrescriptionPolicy;
export function validateBeginner5kAdaptationPrescriptionPolicy(policy: Beginner5kAdaptationPrescriptionPolicy): string[] {
  const errors: string[] = [];
  if (policy.schemaVersion !== 'beginner-5k-adaptation-prescription-policy-v1' || !policy.policyId || !policy.version) errors.push('invalid_policy_identity');
  if (policy.lifecycle !== 'draft' || policy.releaseEligibility !== 'blocked' || policy.safetyConstraints.canActivate) errors.push('draft_release_gate_invalid');
  if (!policy.safetyConstraints.repeatOnlyExactAuthoredStage || !policy.safetyConstraints.neverDuplicateFinalEvent || !policy.safetyConstraints.fixedDateRepeatMustConflict || !policy.safetyConstraints.modifiedProgressionRequiresCoachReview) errors.push('safety_constraints_missing');
  return errors;
}
