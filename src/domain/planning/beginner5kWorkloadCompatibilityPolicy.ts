import draftPolicyJson from '../../../PolicyPack/12_beginner_5k_workload_compatibility_v0.4.0_draft.json';

export type CompatibilityOutcome = 'candidate_compatible_draft_only' | 'insufficient_information' | 'conflicting_evidence' | 'requires_review' | 'scheduling_incompatible' | 'health_hold';
export type CompatibilityEvidenceKey = 'adult_age_confirmed' | 'can_walk_30_minutes_comfortably' | 'health_concern' | 'continuous_run_minutes' | 'weekly_running_minutes' | 'longest_recent_session_minutes' | 'available_training_days' | 'weekday_minute_limits' | 'plan_start_date';
export type Beginner5kWorkloadCompatibilityPathway = {
  pathwayId: string;
  pathwayVersion: string;
  workoutPolicyPack: string;
  requiredEvidence: readonly CompatibilityEvidenceKey[];
  numericRules: { minimumWalkMinutes: number; maximumEvidenceAgeDays: number; minimumContinuousRunMinutes: number | null; minimumWeeklyRunningMinutes: number | null; minimumLongestSessionMinutes: number | null };
  notes: string;
};
export type Beginner5kWorkloadCompatibilityPolicy = {
  schemaVersion: 'beginner-5k-workload-compatibility-v1';
  policyId: string;
  version: string;
  lifecycle: 'draft' | 'reviewed' | 'retired';
  releaseEligibility: 'blocked' | 'eligible_after_release_review';
  goal: 'first_5k_completion';
  applicablePathways: readonly Beginner5kWorkloadCompatibilityPathway[];
  reviewer: string | null;
  reviewDate: string | null;
  approvalScope: string | null;
};

export const beginner5kWorkloadCompatibilityV04 = draftPolicyJson as unknown as Beginner5kWorkloadCompatibilityPolicy;

/** Content validation only. Passing this does not approve or activate the policy. */
export function validateBeginner5kWorkloadCompatibilityPolicy(policy: Beginner5kWorkloadCompatibilityPolicy): string[] {
  const errors: string[] = [];
  if (policy.schemaVersion !== 'beginner-5k-workload-compatibility-v1') errors.push('unsupported_schema');
  if (policy.policyId !== 'runsensei.5k.beginner.workload-compatibility' || !policy.version) errors.push('missing_policy_identity');
  if (policy.lifecycle !== 'draft' || policy.releaseEligibility !== 'blocked') errors.push('draft_release_gate_invalid');
  if (!policy.applicablePathways.length) errors.push('missing_pathway_rules');
  for (const pathway of policy.applicablePathways) {
    if (!pathway.pathwayId || !pathway.pathwayVersion || !pathway.workoutPolicyPack) errors.push('invalid_pathway_reference');
    const numeric = pathway.numericRules;
    if (numeric.minimumWalkMinutes !== 30 || numeric.maximumEvidenceAgeDays !== 28) errors.push(`unexpected_candidate_constants:${pathway.pathwayId}`);
    for (const value of [numeric.minimumContinuousRunMinutes, numeric.minimumWeeklyRunningMinutes, numeric.minimumLongestSessionMinutes]) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) errors.push(`invalid_numeric_rule:${pathway.pathwayId}`);
    }
  }
  return errors;
}

export function resolveCompatibilityPathway(policy: Beginner5kWorkloadCompatibilityPolicy, pathwayId: string, pathwayVersion: string) {
  return policy.applicablePathways.find((pathway) => pathway.pathwayId === pathwayId && pathway.pathwayVersion === pathwayVersion) ?? null;
}
