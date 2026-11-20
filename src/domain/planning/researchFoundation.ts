import policy from '../../../PolicyPack/foundation/03_block_reassessment_v0.1.0_draft.json';
import calendarReassessment from '../../../PolicyPack/foundation/06_reassessment_calendar_v0.2.0_draft.json';
import foundationPolicy from '../../../PolicyPack/foundation/02_multiweek_v0.2.0_draft.json';
import { addCalendarDays } from '@/domain/calendar/operations';
import { generateFoundationProgram, validateFoundationProgram, type FoundationProgramEvidence } from './foundationProgram';
import { durationSeconds, type MultiDistanceRunnerConstraints } from './multiDistancePolicy';
import { analyzeWorkoutPerformance } from '@/domain/performance/analyzeWorkoutPerformance';
import type { PlannedWorkoutSnapshot, WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';
import type { GuidedPhaseCompletion } from '@/domain/tracking/guidedWorkout';
import { isDateOnly } from '@/domain/calendar/dateOnly';

export type FoundationProgram = Extract<ReturnType<typeof generateFoundationProgram>, { kind: 'foundation_program' }>;
export type ResearchBlock = {
  id: string; ownerId: string; researchOnly: true; productionEligible: false;
  evidenceReference: string; evidence: FoundationProgramEvidence; constraints: MultiDistanceRunnerConstraints;
  program: FoundationProgram; assignments: PlannedWorkoutSnapshot[];
  parentBlockId: string | null; createdAt: string;
  transitionProvenance?: { decisionId: string; policyReference: string; sourceOutcomeIds: string[] };
};
export type ResearchOutcome = {
  id: string; blockId: string; assignmentId: string; previousVersionId: string | null;
  removed: boolean; associatedActivityId: string | null; recordedAt: string; record: WorkoutCompletionRecord;
  runningDurationSource?: 'manual_report' | 'unknown';
  guidedExecution?: { trackingSessionId: string; snapshotFingerprint: string; completedPhases: readonly GuidedPhaseCompletion[] };
  associatedActivitySnapshot?: Readonly<Record<string, unknown>>;
};
export const reassessmentPolicyReference = `${policy.id}@${policy.version}`;

/** Stable serialization includes all evidence, unlike a lossy short identifier hash. */
export function researchBlockKey(evidenceReference: string, program: FoundationProgram) {
  return JSON.stringify([evidenceReference, program]);
}
export function snapshotResearchBlock(input: Omit<ResearchBlock, 'assignments' | 'researchOnly' | 'productionEligible'>): ResearchBlock {
  const version = input.program.policyReference.split('@')[1];
  if (!input.ownerId || input.constraints.ownerId !== input.ownerId || !validateFoundationProgram(input.program.workouts, input.evidence, input.constraints, version).valid) throw new Error('invalid_research_block');
  if (JSON.stringify(generateFoundationProgram(input.evidence, input.constraints, version)) !== JSON.stringify(input.program)) throw new Error('research_program_snapshot_mismatch');
  const assignments = input.program.workouts.map(w => ({
    assignmentId: `${input.id}:w${w.week}:${w.slot}`, logicalSessionId: `${input.id}:w${w.week}:${w.slot}`,
    planId: input.id, revisionId: input.id, plannedDate: w.date, policyReferences: [...w.policyReferences],
    pathwayReference: { id: 'runsensei.foundation.multiweek', version: version! },
    structure: w.steps.some(s => s.kind === 'recovery') ? 'run_walk' as const : 'continuous_run' as const,
    durationSeconds: durationSeconds(w.steps), distanceMeters: null,
    steps: w.steps.map(s => ({ kind: s.kind === 'work' ? 'run' as const : s.kind, seconds: s.target.kind === 'duration_seconds' ? s.target.value : null, repeats: s.repeats })),
  }));
  return JSON.parse(JSON.stringify({ ...input, assignments, researchOnly: true, productionEligible: false })) as ResearchBlock;
}

/** Append order is established transactionally by the repository; forks are rejected. */
export function currentResearchOutcomes(history: readonly ResearchOutcome[]) {
  const superseded = new Set(history.map(o => o.previousVersionId).filter(Boolean));
  const current = history.filter(o => !superseded.has(o.id) && !o.removed);
  if (new Set(current.map(o => o.assignmentId)).size !== current.length) throw new Error('conflicting_outcome_versions');
  return current;
}
export function describeResearchBlock(block: ResearchBlock, history: readonly ResearchOutcome[]) {
  const current = currentResearchOutcomes(history);
  return block.assignments.map(assignment => {
    const outcome = current.find(o => o.assignmentId === assignment.assignmentId);
    const analysis = outcome ? analyzeWorkoutPerformance(outcome.record, assignment) : null;
    return { assignment, outcome: outcome ?? null, status: outcome?.record.status ?? 'unreported', analysis: analysis && outcome ? { ...analysis, evidenceIds: [...analysis.evidenceIds, outcome.id, ...(outcome.associatedActivityId ? [outcome.associatedActivityId] : [])] } : null };
  });
}
export type ResearchReassessment = {
  researchOnly: true; productionEligible: false; policyReference: string; sourceBlockId: string;
  evidenceIds: string[]; reasonCodes: string[]; healthHold: boolean;
  kind: 'next_block' | 'insufficient_evidence' | 'hold_for_review' | 'policy_gap';
  transition: 'continue_foundation' | 'walk_run_to_continuous_foundation' | null;
  nextProgram: FoundationProgram | null;
};
export function reassessResearchFoundation(block: ResearchBlock, history: readonly ResearchOutcome[], input: {
  evidence: FoundationProgramEvidence; constraints: MultiDistanceRunnerConstraints; confirmedAt: string; asOfDate: string; interruption: boolean;
}): ResearchReassessment {
  const currentPolicy = block.program.policyReference === calendarReassessment.nextPolicy ? calendarReassessment : policy;
  const reassessmentPolicyReference = `${currentPolicy.id}@${currentPolicy.version}`;
  const base = { researchOnly: true as const, productionEligible: false as const, policyReference: reassessmentPolicyReference, sourceBlockId: block.id, evidenceIds: history.map(o => o.id), healthHold: false, transition: null, nextProgram: null };
  const reject = (kind: ResearchReassessment['kind'], reason: string, healthHold = false): ResearchReassessment => ({ ...base, kind, reasonCodes: [reason], healthHold });
  if (history.some(o => o.record.discomfort === 'pain_or_injury_concern') || input.evidence.healthConcern || input.evidence.healthRelatedInterruption) return reject('hold_for_review', 'health_concern_requires_review', true);
  const seen = new Map<string, ResearchOutcome>();
  for (const outcome of history) {
    const assignment = block.assignments.find(a => a.assignmentId === outcome.assignmentId);
    const previous = outcome.previousVersionId ? seen.get(outcome.previousVersionId) : null;
    if (!assignment || outcome.blockId !== block.id || seen.has(outcome.id) ||
      outcome.record.workoutId !== assignment.logicalSessionId || outcome.record.planId !== block.id || outcome.record.revisionId !== block.id ||
      (outcome.previousVersionId && (!previous || previous.assignmentId !== outcome.assignmentId))) return reject('hold_for_review', 'invalid_outcome_lineage');
    seen.set(outcome.id, outcome);
  }
  if (block.program.policyReference !== currentPolicy.nextPolicy || input.constraints.ownerId !== block.ownerId) return reject('policy_gap', 'unsupported_policy_or_owner');
  let facts: ReturnType<typeof describeResearchBlock>;
  try { facts = describeResearchBlock(block, history); } catch { return reject('hold_for_review', 'conflicting_outcome_versions'); }
  if (facts.some(f => f.analysis?.dataQualityIssues.length)) return reject('hold_for_review', 'conflicting_performance_evidence');
  if (input.interruption || facts.some(f => f.outcome?.record.fatigue === 'unusual')) return reject('hold_for_review', 'interruption_or_fatigue_requires_review');
  if (facts.some(f => !f.outcome)) return reject('insufficient_evidence', 'unreported_workouts');
  if (facts.some(f => f.status !== 'completed')) return reject('policy_gap', 'incomplete_block_repetition_or_reduction_not_authored');
  if (facts.some(f => f.outcome!.record.difficulty === 'too_difficult')) return reject('hold_for_review', 'difficult_workout_requires_review');
  if (facts.some(f => f.outcome!.record.difficulty !== 'comfortable' || f.outcome!.record.fatigue !== 'none' || f.outcome!.record.discomfort !== 'none')) return reject('insufficient_evidence', 'completion_feedback_required');
  if (facts.some(f => !['medium', 'high'].includes(f.outcome!.record.durationReliability))) return reject('insufficient_evidence', 'reliable_duration_evidence_required');
  if (facts.some(f => f.analysis!.duration.kind !== 'comparable' || f.analysis!.runningTime.kind !== 'comparable')) return reject('insufficient_evidence', 'comparable_total_and_running_duration_required');
  if (facts.some(f => (f.analysis!.duration.kind === 'comparable' && f.analysis!.duration.difference < 0) || (f.analysis!.runningTime.kind === 'comparable' && f.analysis!.runningTime.difference < 0))) return reject('policy_gap', 'shortened_workout_reassessment_not_authored');
  const dates = facts.map(f => f.outcome!.record.actualDate);
  if (dates.some(d => !d || !isDateOnly(d) || d > input.asOfDate)) return reject('insufficient_evidence', 'valid_actual_dates_required');
  if (dates[0]! < block.assignments[0]!.plannedDate || dates.some((date, i) => i > 0 && date! < addCalendarDays(dates[i - 1]! as `${number}-${number}-${number}`, foundationPolicy.minimum_rest_days + 1))) return reject('hold_for_review', 'actual_recovery_spacing_requires_review');
  const last = [...dates as string[], ...block.assignments.map(a => a.plannedDate)].sort().at(-1)!;
  if (!isDateOnly(input.asOfDate) || !isDateOnly(input.confirmedAt) || input.confirmedAt <= last || input.confirmedAt > input.asOfDate || !input.evidence.currentEvidenceConfirmed) return reject('insufficient_evidence', 'confirm_current_capacity_after_block');
  if (input.constraints.goalFamily !== block.constraints.goalFamily) return reject('policy_gap', 'goal_change_requires_separate_assessment');
  if (input.constraints.startDate <= last || input.constraints.startDate < input.asOfDate) return reject('insufficient_evidence', 'choose_future_block_start');
  const nextVersion = currentPolicy.nextPolicy.split('@')[1];
  const generated = generateFoundationProgram(input.evidence, input.constraints, nextVersion);
  if (generated.kind !== 'foundation_program') return { ...reject('policy_gap', 'next_block_not_supported'), reasonCodes: [...generated.reasonCodes] };
  if (generated.workouts[0]!.date < addCalendarDays(last as `${number}-${number}-${number}`, foundationPolicy.minimum_rest_days + 1)) return reject('policy_gap', 'cross_block_recovery_spacing');
  if (!validateFoundationProgram(generated.workouts, input.evidence, input.constraints, nextVersion).valid) return reject('hold_for_review', 'next_block_validation_failed');
  return { ...base, kind: 'next_block', reasonCodes: ['confirmed_capacity_recalculated_under_draft_policy'], nextProgram: generated,
    transition: input.evidence.context === 'currently_training' && block.assignments.some(a => a.structure === 'run_walk') && generated.workouts.every(w => w.steps.every(s => s.kind !== 'recovery')) ? 'walk_run_to_continuous_foundation' : 'continue_foundation' };
}
