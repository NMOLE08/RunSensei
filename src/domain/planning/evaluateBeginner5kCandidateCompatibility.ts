import { bundledDraft5kProgramRegistry } from './draft5kProgramRegistry';
import type { Beginner5kPathway } from './beginner5kPersonalizationPolicy';
import { beginner5kWorkloadCompatibilityV04, resolveCompatibilityPathway, type CompatibilityOutcome } from './beginner5kWorkloadCompatibilityPolicy';
import { compareWeeklyTotalAndLongestSession, type LongestSessionObservation, type WeeklyVolumeObservation } from './measurementComparability';
import { nextMondayOnOrAfter } from './runnerConstraints';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { hasFeasibleWeekOnePlacement } from './evaluateScheduleFeasibility';
import { usesCalendarAvailability, type Beginner5kAvailabilityReference } from './beginner5kCalendarAvailability';

export type Beginner5kCandidateEvidence = {
  adultAgeConfirmed: boolean | null;
  canWalk30MinutesComfortably: boolean | null;
  healthConcern: boolean | null;
  interruption: 'none' | 'under_1_week' | 'one_to_four_weeks' | 'over_four_weeks' | 'health_related' | 'unknown';
  planStartDate: string | null;
  availableDays: readonly number[];
  weekdayMinuteLimits: Readonly<Record<number, number | null>>;
  continuousRunMinutes: number | null;
  weeklyRunningMinutes: number | null;
  longestRecentSessionMinutes: number | null;
  historyAgeDays: number | null;
  longestSessionAgeDays: number | null;
  /** Optional metadata: older callers remain explicitly non-comparable. */
  weeklyRunningObservation?: WeeklyVolumeObservation;
  longestSessionObservation?: LongestSessionObservation;
};
export type CandidateCompatibilityResult = {
  outcome: CompatibilityOutcome;
  reasonCodes: readonly string[];
  evaluatedRules: readonly string[];
  policy: { policyId: string; version: string };
  pathway: { id: string; version: string };
  productionEligible: false;
};

/**
 * Research-only evaluator for v0.4. It makes candidate comparisons explicit,
 * but can never authorize a live plan or override the production selector.
 */
export function evaluateBeginner5kCandidateCompatibility(pathway: Beginner5kPathway, evidence: Beginner5kCandidateEvidence, availability?: Beginner5kAvailabilityReference): CandidateCompatibilityResult {
  if (availability && !usesCalendarAvailability(availability)) return { outcome: 'requires_review', reasonCodes: ['availability_policy_unavailable'], evaluatedRules: [], policy: availability, pathway: { id: pathway.id, version: pathway.version }, productionEligible: false };
  const policy = beginner5kWorkloadCompatibilityV04;
  const base = { policy: { policyId: policy.policyId, version: policy.version }, pathway: { id: pathway.id, version: pathway.version }, productionEligible: false as const };
  const rule = resolveCompatibilityPathway(policy, pathway.id, pathway.version);
  if (!rule) return { ...base, outcome: 'requires_review', reasonCodes: ['compatibility_pathway_rule_unavailable'], evaluatedRules: [] };
  if (evidence.healthConcern === true || evidence.interruption === 'health_related') return { ...base, outcome: 'health_hold', reasonCodes: ['health_concern_reported'], evaluatedRules: ['health_hold'] };
  const missing = requiredEvidenceMissing(rule.requiredEvidence.filter(key => !(usesCalendarAvailability(availability) && key === 'weekday_minute_limits')), evidence);
  if (missing.length) return { ...base, outcome: 'insufficient_information', reasonCodes: missing.map((item) => `missing_${item}`), evaluatedRules: ['required_evidence'] };
  if (evidence.interruption !== 'none') return { ...base, outcome: 'requires_review', reasonCodes: ['interruption_requires_review'], evaluatedRules: ['interruption_v1'] };
  if (isOutdated(evidence.historyAgeDays, rule.numericRules.maximumEvidenceAgeDays) || isOutdated(evidence.longestSessionAgeDays, rule.numericRules.maximumEvidenceAgeDays)) return { ...base, outcome: 'insufficient_information', reasonCodes: ['outdated_running_history'], evaluatedRules: ['evidence_freshness_v1'] };
  if ((evidence.weeklyRunningMinutes ?? 0) < 0 || (evidence.longestRecentSessionMinutes ?? 0) < 0 || (evidence.continuousRunMinutes ?? 0) < 0) return { ...base, outcome: 'conflicting_evidence', reasonCodes: ['negative_running_history'], evaluatedRules: ['evidence_consistency'] };
  const comparability = compareWeeklyTotalAndLongestSession(
    evidence.weeklyRunningObservation ?? { valueMinutes: evidence.weeklyRunningMinutes, window: { start: null, end: null }, unit: 'unknown', aggregation: 'unknown', includesLongestSession: null },
    evidence.longestSessionObservation ?? { valueMinutes: evidence.longestRecentSessionMinutes, window: { start: null, end: null }, unit: 'unknown', aggregation: 'unknown' },
  );
  if (comparability.kind === 'comparable' && evidence.weeklyRunningMinutes !== null && evidence.longestRecentSessionMinutes !== null && evidence.longestRecentSessionMinutes > evidence.weeklyRunningMinutes) return { ...base, outcome: 'conflicting_evidence', reasonCodes: ['longest_session_exceeds_weekly_running_minutes'], evaluatedRules: ['evidence_consistency'] };
  const program = bundledDraft5kProgramRegistry.resolve(pathway.workoutPolicyPack);
  if (!program) return { ...base, outcome: 'requires_review', reasonCodes: ['workout_policy_pack_unavailable'], evaluatedRules: [] };
  const scheduleAnchor = isDateOnly(evidence.planStartDate ?? '') ? nextMondayOnOrAfter(evidence.planStartDate as `${number}-${number}-${number}`) : evidence.planStartDate!;
  const simulation = program.simulate(scheduleAnchor, [...evidence.availableDays], false);
  if (simulation.kind === 'blocked') return { ...base, outcome: 'scheduling_incompatible', reasonCodes: simulation.reasons, evaluatedRules: ['weekday_time_v1'] };
  if (!usesCalendarAvailability(availability) && !hasFeasibleWeekOnePlacement(program, scheduleAnchor, evidence.availableDays, evidence.weekdayMinuteLimits)) return { ...base, outcome: 'scheduling_incompatible', reasonCodes: ['weekday_time_limit_below_prescribed_session'], evaluatedRules: ['weekday_time_v1'] };
  const failures: string[] = [];
  if (!evidence.adultAgeConfirmed) failures.push('adult_confirmation_not_met');
  if (!evidence.canWalk30MinutesComfortably) failures.push('walk_30_minutes_not_met');
  if (rule.numericRules.minimumContinuousRunMinutes !== null && (evidence.continuousRunMinutes ?? 0) < rule.numericRules.minimumContinuousRunMinutes) failures.push('continuous_capacity_below_candidate_minimum');
  if (rule.numericRules.minimumWeeklyRunningMinutes !== null && (evidence.weeklyRunningMinutes ?? 0) < rule.numericRules.minimumWeeklyRunningMinutes) failures.push('weekly_running_minutes_below_candidate_minimum');
  if (rule.numericRules.minimumLongestSessionMinutes !== null && (evidence.longestRecentSessionMinutes ?? 0) < rule.numericRules.minimumLongestSessionMinutes) failures.push('longest_session_below_candidate_minimum');
  if (failures.length) return { ...base, outcome: 'requires_review', reasonCodes: failures, evaluatedRules: ['run_walk_entry_v1', 'continuous_capacity_v1', 'continuous_weekly_history_v1', 'continuous_longest_session_v1'] };
  return { ...base, outcome: 'candidate_compatible_draft_only', reasonCodes: ['candidate_rules_satisfied_not_production_authorization'], evaluatedRules: ['required_evidence', 'evidence_freshness_v1', 'run_walk_entry_v1', availability ? `${availability.policyId}@${availability.version}` : 'weekday_time_v1'] };
}

function requiredEvidenceMissing(keys: readonly string[], evidence: Beginner5kCandidateEvidence): string[] {
  return keys.filter((key) => {
    switch (key) {
      case 'adult_age_confirmed': return evidence.adultAgeConfirmed === null;
      case 'can_walk_30_minutes_comfortably': return evidence.canWalk30MinutesComfortably === null;
      case 'health_concern': return evidence.healthConcern === null;
      case 'continuous_run_minutes': return evidence.continuousRunMinutes === null;
      case 'weekly_running_minutes': return evidence.weeklyRunningMinutes === null;
      case 'longest_recent_session_minutes': return evidence.longestRecentSessionMinutes === null;
      case 'available_training_days': return evidence.availableDays.length === 0;
      case 'weekday_minute_limits': return evidence.availableDays.some((day) => evidence.weekdayMinuteLimits[day] === null || evidence.weekdayMinuteLimits[day] === undefined);
      case 'plan_start_date': return !evidence.planStartDate;
      default: return true;
    }
  });
}
function isOutdated(ageDays: number | null, maximumAgeDays: number) { return ageDays !== null && ageDays > maximumAgeDays; }
