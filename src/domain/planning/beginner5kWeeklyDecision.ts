import policy from '../../../PolicyPack/foundation/02_multiweek_v0.2.0_draft.json';
import reassessmentPolicy from '../../../PolicyPack/foundation/03_block_reassessment_v0.1.0_draft.json';
import { generateFoundationProgram, validateFoundationProgram } from './foundationProgram';
import { describeResearchBlock, reassessResearchFoundation, type FoundationProgram, type ResearchBlock, type ResearchOutcome } from './researchFoundation';
import { MultiDistancePolicyRegistry } from './multiDistancePolicyRegistry';
import { durationSeconds, type ScheduledPolicyWorkout } from './multiDistancePolicy';
import { evidenceRevisionFingerprint, type Beginner5kRunnerEvidence } from './beginner5kRunnerEvidence';
import { compareBeginner5kStartingWorkload, startingWorkloadProposalReference, type StartingWorkloadComparison } from './beginner5kStartingWorkload';
import { evaluateBeginner5kPolicyReadiness, type Beginner5kPolicyReadiness } from './beginner5kPolicyReadiness';

export const beginnerFoundationReference = `${policy.policy_id}@${policy.version}`;
export type WeeklyDecisionInput = { evidence: Beginner5kRunnerEvidence; block: ResearchBlock | null; outcomes: readonly ResearchOutcome[]; policyReference: string; week: number; expectedFingerprint?: string; evidenceRevisionIdentity?: { weeklyConfirmations: readonly string[]; trainingEpisode: string } };
export type WeeklyDecisionPreview = {
  researchOnly: true; productionEligible: false; kind: 'preview' | 'evidence_gap' | 'policy_gap' | 'schedule_conflict' | 'health_hold' | 'hold_for_review';
  fingerprint: string; evidence: Beginner5kRunnerEvidence; policyReferences: string[]; reasons: string[];
  trace: { ruleId: string; policyReference: string; inputs: unknown; result: unknown; explanation: string }[];
  program: FoundationProgram | null; workouts: readonly ScheduledPolicyWorkout[];
  totals: { runningSeconds: number; walkingSeconds: number; scheduledSeconds: number } | null;
  validation: ReturnType<typeof validateFoundationProgram> | null;
  performanceFacts: ReturnType<typeof describeResearchBlock> | null;
  startingWorkloadComparison: StartingWorkloadComparison;
  policyReadiness: Beginner5kPolicyReadiness;
};

export function previewBeginner5kWeek(input: WeeklyDecisionInput): WeeklyDecisionPreview {
  const { evidence: e, block, outcomes } = input;
  const fingerprint = evidenceRevisionFingerprint({ evidence: e, block, outcomes, evidenceRevisionIdentity: input.evidenceRevisionIdentity ?? null, policyReference: input.policyReference, comparisonReference: startingWorkloadProposalReference, week: input.week });
  const policyReferences=[beginnerFoundationReference,startingWorkloadProposalReference,...(block?[`${reassessmentPolicy.id}@${reassessmentPolicy.version}`]:[])];
  const startingWorkloadComparison=compareBeginner5kStartingWorkload(e);
  const currentOutcomeIds=new Set(e.lineage.filter(item=>item.current).map(item=>item.id));
  const performanceSignals=outcomes.filter(outcome=>!e.lineage.length||currentOutcomeIds.has(outcome.id)).map(outcome=>({evidenceId:outcome.id,status:outcome.record.status,difficulty:outcome.record.difficulty,fatigue:outcome.record.fatigue,discomfort:outcome.record.discomfort}));
  const policyReadiness=evaluateBeginner5kPolicyReadiness({evidence:e,comparison:startingWorkloadComparison,evidenceFingerprint:fingerprint,revisionIdentity:input.evidenceRevisionIdentity,policyReferences,performanceSignals});
  const result: WeeklyDecisionPreview = { researchOnly: true, productionEligible: false, kind: 'policy_gap', fingerprint, evidence: e, policyReferences, reasons: [], trace: [], program: null, workouts: [], totals: null, validation: null, performanceFacts: null, startingWorkloadComparison, policyReadiness };
  const stop = (kind: WeeklyDecisionPreview['kind'], ...reasons: string[]) => ({ ...result, kind, reasons, trace: [...result.trace, { ruleId: 'preview_boundary', policyReference: beginnerFoundationReference, inputs: { week: input.week, requestedPolicy: input.policyReference }, result: { kind, reasons }, explanation: 'No workout transformation or publication is authorized by this blocked result.' }] });
  result.trace.push({ ruleId: 'evidence_projection', policyReference: beginnerFoundationReference, inputs: e.observations, result: e.issues, explanation: 'Historical longest sessions, GPS elapsed time and guided phase elapsed time do not become current running capacity.' });
  if (e.foundation.healthConcern || e.foundation.healthRelatedInterruption || outcomes.some(o => o.record.discomfort === 'pain_or_injury_concern')) return stop('health_hold', 'health_concern_requires_review');
  if (e.ownerId !== e.constraints.ownerId || (block && (block.ownerId !== e.ownerId || block.constraints.goalFamily !== '5k'))) return stop('evidence_gap', 'account_or_goal_mismatch');
  if (e.constraints.goalFamily !== '5k') return stop('policy_gap', 'beginner_5k_only');
  if (block && (!block.researchOnly || block.productionEligible)) return stop('policy_gap', 'research_block_required');
  if (input.expectedFingerprint && input.expectedFingerprint !== fingerprint) return stop('evidence_gap', 'stale_evidence_revision');
  if (e.issues.length) return stop('evidence_gap', ...e.issues);
  const registry = new MultiDistancePolicyRegistry([{ id: policy.policy_id, version: policy.version, goalFamily: '5k', lifecycle: 'draft', releaseAuthorized: false, supportedFrequency: policy.supported_frequency, minimumRecoveryDays: policy.minimum_rest_days, sourceReferences: [beginnerFoundationReference], requiredEvidence: ['confirmed current running'], missingCapabilities: policy.limitations, weeks: [] }]);
  const resolved = registry.resolve(policy.policy_id, input.policyReference.slice(input.policyReference.lastIndexOf('@') + 1), '5k');
  if (input.policyReference !== beginnerFoundationReference || resolved.kind !== 'found') return stop('policy_gap', 'exact_policy_version_unavailable');
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > policy.weeks) return stop('policy_gap', 'unsupported_foundation_week');
  let program: FoundationProgram;
  if (block) {
    const safeOutcomes = outcomes.map(o => ({ ...o, record: { ...o.record, actualRunningSeconds: o.runningDurationSource === 'manual_report' || o.record.source === 'manual' ? o.record.actualRunningSeconds : null } }));
    const decision = reassessResearchFoundation(block, safeOutcomes, { evidence: e.foundation, constraints: e.constraints, confirmedAt: e.confirmedAt, asOfDate: e.evaluatedOn, interruption: e.interruption });
    if (!decision.reasonCodes.some(code => ['invalid_outcome_lineage', 'conflicting_outcome_versions'].includes(code))) result.performanceFacts = describeResearchBlock(block, safeOutcomes);
    for (const rule of ['completion', 'feedback', 'health', 'confirmation', 'interruption', 'actualSequence', 'transformation', 'unsupported'] as const) {
      result.trace.push({ ruleId: `rules.${rule}`, policyReference: `${reassessmentPolicy.id}@${reassessmentPolicy.version}`, inputs: { outcomeIds: outcomes.map(o => o.id), unreported: e.unreportedAssignmentIds, confirmedAt: e.confirmedAt }, result: { kind: decision.kind, reasons: decision.reasonCodes }, explanation: reassessmentPolicy.rules[rule] });
    }
    if (!decision.nextProgram) return stop(decision.healthHold ? 'health_hold' : decision.kind === 'hold_for_review' ? 'hold_for_review' : decision.kind === 'insufficient_evidence' ? 'evidence_gap' : decision.reasonCodes.some(r => /schedule|time_limit|goal_date|recovery_spacing/.test(r)) ? 'schedule_conflict' : 'policy_gap', ...decision.reasonCodes);
    program = decision.nextProgram;
  } else {
    const generated = generateFoundationProgram(e.foundation, e.constraints);
    for (const rule of ['entry', 'frequency', 'workload', 'structure'] as const) {
      result.trace.push({ ruleId: `rules.${rule}`, policyReference: beginnerFoundationReference, inputs: e.foundation, result: generated.kind === 'foundation_program' ? 'supported_draft' : { reasons: generated.reasonCodes, conflicts: 'conflicts' in generated ? generated.conflicts : [] }, explanation: policy.rules[rule] });
    }
    if (generated.kind !== 'foundation_program') return stop(generated.reasonCodes.some(r => /schedule|time_limit|goal_date|recovery/.test(r)) ? 'schedule_conflict' : generated.reasonCodes.some(r => /required|evidence/.test(r)) ? 'evidence_gap' : 'policy_gap', ...generated.reasonCodes);
    program = generated;
  }
  const validation = validateFoundationProgram(program.workouts, e.foundation, e.constraints);
  result.validation = validation;
  if (!validation.valid) return stop('schedule_conflict', ...validation.issues);
  const workouts = program.workouts.filter(w => w.week === input.week);
  const runningSeconds = workouts.reduce((s, w) => s + (durationSeconds(w.steps.filter(step => step.kind === 'work')) ?? 0), 0);
  const scheduledSeconds = workouts.reduce((s, w) => s + (durationSeconds(w.steps) ?? 0), 0);
  const totals = { runningSeconds, walkingSeconds: scheduledSeconds - runningSeconds, scheduledSeconds };
  result.trace.push({ ruleId: 'rules.workload', policyReference: beginnerFoundationReference, inputs: { initialRunningSeconds: e.foundation.currentWeeklyRunningSeconds, frequency: e.foundation.requestedFrequency, stageAdditionPerSession: policy.additional_running_seconds_per_session_by_week[input.week - 1] }, result: totals, explanation: 'Equal integer-second distribution plus the authored stage addition. Walking is counted separately in full scheduled time. Future stages are conditional illustrations.' });
  result.trace.push({ ruleId: 'validateFoundationProgram', policyReference: beginnerFoundationReference, inputs: e.constraints, result: validation, explanation: 'Independent full-block arithmetic, capacity, date, time-limit and recovery checks.' });
  return { ...result, kind: 'preview', reasons: [block ? 'supported_next_block_research_preview' : 'supported_foundation_research_preview'], program, workouts, totals, validation };
}
