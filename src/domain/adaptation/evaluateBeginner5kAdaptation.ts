import type { WorkoutPerformanceAnalysis } from '@/domain/performance/analyzeWorkoutPerformance';
import type { RecentWorkoutTrend, WeeklyPerformanceSummary } from '@/domain/performance/summarizeWorkoutHistory';
import { beginner5kAdaptationV01, type AdaptationDecision } from './beginner5kAdaptationPolicy';

export type AdaptationPolicyReference = { policyId: string; version: string };
export type Beginner5kAdaptationInput = {
  policyReference: AdaptationPolicyReference;
  planId: string;
  baseRevisionId: string;
  pathwayReference: { id: string; version: string };
  requiredPolicyReferences: readonly string[];
  analyses: readonly WorkoutPerformanceAnalysis[];
  weekly: WeeklyPerformanceSummary;
  recent: RecentWorkoutTrend;
  interruptionReported: boolean;
};
export type Beginner5kAdaptationResult = {
  decision: AdaptationDecision;
  policy: AdaptationPolicyReference;
  pathwayReference: Beginner5kAdaptationInput['pathwayReference'];
  evidenceIds: readonly string[];
  reasonCodes: readonly string[];
  dataQualityWarnings: readonly string[];
  healthHold: boolean;
  productionEligible: false;
};
export type FutureProposalRequest = { requestedAction: Extract<AdaptationDecision, 'advance_candidate' | 'repeat_candidate' | 'reduce_candidate' | 'maintain_candidate'>; planId: string; baseRevisionId: string; pathwayReference: { id: string; version: string }; sourcePolicy: AdaptationPolicyReference; evidenceIds: readonly string[]; requiredPolicyReferences: readonly string[] };

/** Deterministic draft-only decision precedence. It produces no plan mutation or executable request. */
export function evaluateBeginner5kAdaptation(input: Beginner5kAdaptationInput): Beginner5kAdaptationResult {
  const policy = beginner5kAdaptationV01;
  const base = { policy: { policyId: policy.policyId, version: policy.version }, pathwayReference: input.pathwayReference, productionEligible: false as const };
  const evidenceIds = [...new Set(input.analyses.flatMap((item) => item.evidenceIds))];
  const warnings = [...new Set([...input.weekly.dataQualityIssues, ...input.analyses.flatMap((item) => item.dataQualityIssues)])].sort();
  if (input.policyReference.policyId !== policy.policyId || input.policyReference.version !== policy.version) return result(base, 'policy_gap', evidenceIds, ['adaptation_policy_version_unavailable'], warnings, false);
  if (input.analyses.some((item) => item.healthHoldSignal) || input.weekly.healthHoldSignal || input.recent.healthHoldSignal) return result(base, 'hold_for_review', evidenceIds, ['health_concern_reported'], warnings, true);
  if (warnings.some(isCriticalIntegrityIssue)) return result(base, 'hold_for_review', evidenceIds, ['critical_data_integrity_issue'], warnings, false);
  if (input.interruptionReported || input.analyses.some((item) => item.reportedFatigue === 'unusual')) return result(base, 'hold_for_review', evidenceIds, ['interruption_or_unusual_fatigue_requires_review'], warnings, false);
  if (input.analyses.some((item) => item.status !== 'unreported' && item.dataQualityIssues.includes('unreported_outcome'))) return result(base, 'insufficient_evidence', evidenceIds, ['unreported_outcome'], warnings, false);
  if (input.weekly.unreported > 0 || input.weekly.reportedOutcomes < input.weekly.scheduledWorkouts) return result(base, 'insufficient_evidence', evidenceIds, ['scheduled_outcome_unreported'], warnings, false);
  if (input.analyses.some((item) => !sameReferences(item.policyReferences, input.requiredPolicyReferences))) return result(base, 'policy_gap', evidenceIds, ['historical_policy_reference_unavailable_or_mismatched'], warnings, false);
  const difficult = input.recent.difficultyCounts.too_difficult;
  if (input.recent.difficultyCounts.challenging > 0) return result(base, 'insufficient_evidence', evidenceIds, ['challenging_feedback_not_covered_by_draft_policy'], warnings, false);
  if (difficult >= 2) return result(base, 'reduce_candidate', evidenceIds, ['repeated_difficult_pattern_draft_rule'], warnings, false);
  if (input.weekly.partial > 0 || input.weekly.missed > 0) return result(base, 'repeat_candidate', evidenceIds, [input.weekly.partial > 0 ? 'partial_workout_reported' : 'missed_workout_reported', 'no_make_up_workload'], warnings, false);
  if (difficult === 1) return result(base, 'maintain_candidate', evidenceIds, ['isolated_difficult_feedback_no_decline_inference'], warnings, false);
  if (input.weekly.completed === input.weekly.scheduledWorkouts && input.weekly.scheduledWorkouts > 0) return result(base, 'advance_candidate', evidenceIds, ['completed_week_draft_rule'], warnings, false);
  return result(base, 'policy_gap', evidenceIds, ['no_authored_adaptation_rule_for_current_facts'], warnings, false);
}

/** Enforces the boundary: draft or non-actionable decisions cannot create a proposal request. */
export function createFutureProposalRequest(input: Beginner5kAdaptationInput, decision: Beginner5kAdaptationResult): FutureProposalRequest | null {
  if (decision.productionEligible || beginner5kAdaptationV01.lifecycle !== 'reviewed' || beginner5kAdaptationV01.releaseEligibility !== 'eligible_after_release_review') return null;
  if (decision.decision !== 'advance_candidate' && decision.decision !== 'repeat_candidate' && decision.decision !== 'reduce_candidate' && decision.decision !== 'maintain_candidate') return null;
  return { requestedAction: decision.decision, planId: input.planId, baseRevisionId: input.baseRevisionId, pathwayReference: input.pathwayReference, sourcePolicy: decision.policy, evidenceIds: decision.evidenceIds, requiredPolicyReferences: input.requiredPolicyReferences };
}

function result(base: Omit<Beginner5kAdaptationResult, 'decision' | 'evidenceIds' | 'reasonCodes' | 'dataQualityWarnings' | 'healthHold'>, decision: AdaptationDecision, evidenceIds: readonly string[], reasonCodes: readonly string[], dataQualityWarnings: readonly string[], healthHold: boolean): Beginner5kAdaptationResult { return { ...base, decision, evidenceIds, reasonCodes, dataQualityWarnings, healthHold }; }
function isCriticalIntegrityIssue(issue: string) { return issue.startsWith('invalid_') || issue === 'running_duration_exceeds_total_duration'; }
function sameReferences(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((item, index) => item === right[index]); }
