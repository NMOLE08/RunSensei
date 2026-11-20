import type { Beginner5kPathway, ImmutablePolicyReference, WorkoutPolicyPackReference } from './beginner5kPersonalizationPolicy';
import { Beginner5kPersonalizationRegistry } from './beginner5kPersonalizationRegistry';
import { bundledDraft5kProgramRegistry } from './draft5kProgramRegistry';
import { assessBeginner5kWorkloadCompatibility } from './beginner5kWorkloadCompatibility';
import type { InterruptionStatus } from '@/domain/assessment/types';
import { isDateOnly } from '@/domain/calendar/dateOnly';

export type First5kExperience = 'none_or_limited' | 'substantial' | 'unknown';
export type Beginner5kPersonalizationInput = {
  adultAgeConfirmed: boolean | null;
  canWalk30MinutesComfortably: boolean | null;
  experience: First5kExperience;
  healthConcern: boolean | null;
  interruption: InterruptionStatus;
  goal: 'first_5k_completion' | 'other' | 'unknown';
  goalFocus: 'completion' | 'target_time' | 'unknown';
  planStartDate: string | null;
  availableDays: readonly number[];
  continuousRunMinutes: number | null;
  weeklyRunningMinutes: number | null;
  weeklyDistance: number | null;
  longestRecentSessionMinutes: number | null;
  weekdayMinuteLimits: Readonly<Record<number, number | null>>;
};
export type Beginner5kPathwaySelection =
  | { kind: 'selected_draft_pathway'; policy: ImmutablePolicyReference; pathway: Pick<Beginner5kPathway, 'id' | 'version' | 'label'>; workoutPolicyPack: WorkoutPolicyPackReference; reasonCodes: readonly string[]; productionEligible: false }
  | { kind: 'policy_gap' | 'insufficient_information' | 'scheduling_incompatible' | 'health_hold' | 'not_eligible'; reasonCodes: readonly string[]; productionEligible: false };

/** Selects only an explicitly registered pathway; it never estimates a starting dose. */
export function selectBeginner5kPathway(registry: Beginner5kPersonalizationRegistry, policyReference: ImmutablePolicyReference, input: Beginner5kPersonalizationInput): Beginner5kPathwaySelection {
  if (input.healthConcern === true) return unavailable('health_hold', ['health_concern_reported']);
  const policyResolution = registry.resolvePolicy(policyReference);
  if (policyResolution.kind === 'unavailable') return unavailable('policy_gap', [policyResolution.code]);
  const missing = missingInputs(policyResolution.policy.eligibility.requiredInputs, input);
  if (missing.length) return unavailable('insufficient_information', missing.map((item) => `missing_${item}`));
  if (!isDateOnly(input.planStartDate ?? '')) return unavailable('insufficient_information', ['invalid_plan_start_date']);
  // Keep the unknown state explicit even though the required-input check above
  // normally catches it; this prevents it from being treated as experience.
  const experience = input.experience;
  if (experience === 'unknown') return unavailable('insufficient_information', ['missing_first_5k_experience']);
  if (!input.adultAgeConfirmed || !input.canWalk30MinutesComfortably) return unavailable('not_eligible', ['policy_eligibility_not_met']);
  if (input.interruption !== 'none') return unavailable('policy_gap', ['returning_runner_pathway_requires_review']);
  if (input.goal !== policyResolution.policy.goal || input.goalFocus !== 'completion') return unavailable('not_eligible', ['goal_not_supported']);
  const pathway = policyResolution.policy.pathways.find((candidate) => candidate.supportedExperience.includes(experience));
  if (!pathway) return unavailable('policy_gap', ['no_explicit_pathway_for_experience']);
  const startingWorkloadRule = policyResolution.policy.startingWorkloadRules.find((rule) => rule.id === pathway.startingWorkloadRuleId);
  if (!startingWorkloadRule || startingWorkloadRule.status !== 'defined') return unavailable('policy_gap', ['starting_workload_rule_not_supported']);
  const pathwayResolution = registry.resolvePathway(policyReference, pathway.id, pathway.version);
  if (pathwayResolution.kind === 'unavailable') return unavailable('policy_gap', [pathwayResolution.code]);
  if (pathway.id === 'continuous_running_beginner_fixed_12_week' && (!Number.isFinite(input.continuousRunMinutes) || (input.continuousRunMinutes ?? 0) <= 0)) return unavailable('insufficient_information', ['missing_continuous_running_evidence']);
  const program = bundledDraft5kProgramRegistry.resolve(pathwayResolution.pathway.workoutPolicyPack);
  if (!program) return unavailable('policy_gap', ['workout_policy_pack_unavailable']);
  const schedule = program.simulate(input.planStartDate!, [...input.availableDays], false);
  if (schedule.kind === 'blocked') return unavailable('scheduling_incompatible', schedule.reasons);
  const safety = program.validate(schedule);
  if (!safety.valid) return unavailable('policy_gap', ['schedule_validation_failed', ...safety.violations.map((violation) => violation.code)]);
  const compatibility = assessBeginner5kWorkloadCompatibility(pathwayResolution.pathway, schedule, {
    continuousRunMinutes: input.continuousRunMinutes, weeklyRunningMinutes: input.weeklyRunningMinutes, weeklyDistance: input.weeklyDistance,
    longestRecentSessionMinutes: input.longestRecentSessionMinutes, weekdayMinuteLimits: input.weekdayMinuteLimits,
  });
  if (compatibility.kind === 'scheduling_incompatible') return unavailable('scheduling_incompatible', compatibility.reasonCodes);
  return unavailable('policy_gap', compatibility.reasonCodes);
}

function unavailable(kind: Exclude<Beginner5kPathwaySelection['kind'], 'selected_draft_pathway'>, reasonCodes: readonly string[]): Beginner5kPathwaySelection { return { kind, reasonCodes, productionEligible: false }; }
function missingInputs(keys: readonly string[], input: Beginner5kPersonalizationInput) {
  return keys.filter((key) => {
    switch (key) {
      case 'adult_age_confirmed': return input.adultAgeConfirmed === null;
      case 'can_walk_30_minutes_comfortably': return input.canWalk30MinutesComfortably === null;
      case 'first_5k_experience': return input.experience === 'unknown';
      case 'health_concern': return input.healthConcern === null;
      case 'goal': return input.goal === 'unknown';
      case 'goal_focus': return input.goalFocus === 'unknown';
      case 'plan_start_date': return !input.planStartDate;
      case 'available_training_days': return input.availableDays.length === 0;
      default: return true;
    }
  });
}
