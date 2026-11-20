import * as Crypto from 'expo-crypto';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { TrainingRepository } from '@/data/repositories';
import { requireActiveAccountId } from './localAccount';
import { loadCurrentAccountPlanFacts } from './planAvailability';
import { assessmentEvidenceProjection, assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import type { FoundationProgramEvidence } from '@/domain/planning/foundationProgram';
import type { MultiDistanceRunnerConstraints } from '@/domain/planning/multiDistancePolicy';
import { snapshotResearchBlock, reassessResearchFoundation, type FoundationProgram, type ResearchOutcome } from '@/domain/planning/researchFoundation';
import { completionFromActivity, type WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';
import { localDateOnly } from '@/features/execution/viewModel';
import { activeSeconds, type RecordingSegment } from '@/domain/tracking/session';
import { GuidedWorkoutProgressRepository } from '@/data/guidedWorkoutProgressRepository';

async function access(expectedOwner: string) {
  if (!experimental5kPreviewEnabled) throw new Error('research_access_disabled');
  if (await requireActiveAccountId() !== expectedOwner) throw new Error('account_changed');
  const db = await openAppDatabase(); await migrate(db, new Date().toISOString());
  return { db, repository: new ResearchFoundationRepository(db, expectedOwner) };
}
export function currentInputs(d: FitnessAssessmentDraft, ownerId: string) {
  if (d.goal === 'habit' || d.currentTrainingStatus === 'unknown' || !isDateOnly(d.planStartDate)) throw new Error('current_foundation_information_required');
  const seconds = (s: string) => s.trim() && Number.isFinite(Number(s)) ? Number(s) * 60 : null;
  const evidence: FoundationProgramEvidence = { context: d.currentTrainingStatus, currentWeeklyRunningSeconds: seconds(d.weeklyMinutes), currentContinuousRunningSeconds: seconds(d.comfortableRunMinutes), currentEvidenceConfirmed: isDateOnly(d.foundationEvidenceConfirmedAt ?? ''), comfortableWalkingConfirmed: isDateOnly(d.foundationEvidenceConfirmedAt ?? ''), demonstratedAfterBreak: d.foundationPostBreakConfirmed === true, requestedFrequency: d.foundationFrequency ?? null, healthConcern: d.healthConcern, healthRelatedInterruption: d.interruption === 'health_related' || d.interruptionReason === 'illness_or_injury' };
  const constraints: MultiDistanceRunnerConstraints = { ownerId, goalFamily: d.goal, startDate: nextMondayOnOrAfter(d.planStartDate), fixedGoalDate: d.goalDateFixed && isDateOnly(d.goalDate) ? d.goalDate : null, availableDays: d.trainingDays.map(weekday => ({ weekday, maxMinutes: d.minuteLimits[weekday]?.trim() ? Number(d.minuteLimits[weekday]) : null, confirmedByRunner: d.minuteLimitConfirmedDays.includes(weekday) })), unavailableDates: d.unavailableDates.split(',').map(s => s.trim()).filter(isDateOnly), preferredLongRunDay: d.preferredLongDay };
  if (d.goalDateFixed && !constraints.fixedGoalDate) throw new Error('invalid_goal_date');
  return { evidence, constraints };
}
async function currentFacts(owner: string) {
  const facts = await loadCurrentAccountPlanFacts();
  if (facts.ownerId !== owner || !facts.draft || facts.assessment?.inputFingerprint !== assessmentEvidenceFingerprint(facts.draft)) throw new Error('current_account_assessment_required');
  return { ...currentInputs(facts.draft, owner), draft: facts.draft, evidenceReference: JSON.stringify(assessmentEvidenceProjection(facts.draft)) };
}
export async function saveResearchFoundationPreview(owner: string, program: FoundationProgram) {
  const { repository } = await access(owner); const facts = await currentFacts(owner);
  return repository.saveBlock(snapshotResearchBlock({ id: `research-${Crypto.randomUUID()}`, ownerId: owner, evidenceReference: facts.evidenceReference, evidence: facts.evidence, constraints: facts.constraints, program, parentBlockId: null, createdAt: new Date().toISOString() }));
}
export async function loadResearchFoundationHistory(owner: string) {
  const { repository } = await access(owner);
  const blocks = await repository.blocks();
  return Promise.all(blocks.map(async block => ({ block, lifecycle: await repository.lifecycle(block.id), outcomes: await repository.outcomes(block.id), decisions: await repository.decisions(block.id) })));
}
export async function availableResearchActivities(owner: string) {
  const { db } = await access(owner);
  const logs = await new TrainingRepository(db, owner).getActivityHistory();
  const superseded = new Set(logs.map(l => l.previousVersionId));
  const tracked = await db.getAll<{ id: string; mode: 'run' | 'walk'; state: string; planned_session_id: string | null; started_at_ms: number; ended_at_ms: number; segments_json: string; distance_meters: number | null; status_reason: string | null }>('SELECT id, mode, state, planned_session_id, started_at_ms, ended_at_ms, segments_json, distance_meters, status_reason FROM tracking_sessions WHERE owner_id = ?', [owner]);
  const candidates = logs.filter(l => !l.sessionId && !superseded.has(l.id)).map(log => ({ id: log.id, actualDate: log.actualDate, durationSeconds: log.durationSeconds, sourceKind: 'activity_log' as const, log }));
  const recordings = tracked.filter(t => t.state === 'saved' && !t.planned_session_id).map(t => {
    const segments = JSON.parse(t.segments_json) as RecordingSegment[];
    if (!Array.isArray(segments) || !segments.length || segments.some(s => !Number.isFinite(s.startedAtMs) || s.endedAtMs === null || !Number.isFinite(s.endedAtMs) || s.endedAtMs < s.startedAtMs)) throw new Error('invalid_recorded_segments');
    return { id: `tracking:${t.id}`, actualDate: localDateOnly(new Date(t.started_at_ms)), durationSeconds: activeSeconds(segments, t.ended_at_ms), sourceKind: 'tracking_session' as const, tracker: t };
  });
  return [...candidates, ...recordings];
}
export type ResearchOutcomeInput = Pick<WorkoutCompletionRecord, 'status' | 'actualDate' | 'actualDurationSeconds' | 'actualRunningSeconds' | 'rpe' | 'difficulty' | 'fatigue' | 'discomfort' | 'note'>;
export async function recordResearchOutcome(owner: string, blockId: string, assignmentId: string, previousVersionId: string | null, input: ResearchOutcomeInput, activityId: string | null = null, removed = false) {
  const { repository, db } = await access(owner);
  const block = await repository.get(blockId); const snapshot = block?.assignments.find(a => a.assignmentId === assignmentId);
  if (!snapshot) throw new Error('research_assignment_not_owned');
  if (input.status === 'unreported' && !removed) throw new Error('use_remove_association_for_unreported');
  if (!removed && (!input.actualDate || !isDateOnly(input.actualDate) || input.actualDate > localDateOnly())) throw new Error('valid_actual_date_required');
  const id = `research-outcome-${Crypto.randomUUID()}`; const now = new Date().toISOString();
  if (removed) {
    const previous = (await repository.outcomes(blockId)).find(o => o.id === previousVersionId && o.assignmentId === assignmentId);
    if (!previous) throw new Error('outcome_to_remove_not_found');
    await access(owner);
    await repository.saveOutcome({ ...previous, id, previousVersionId, removed: true, associatedActivityId: null, recordedAt: now });
    return;
  }
  let record: WorkoutCompletionRecord = { ...input, activityLogId: null, previousVersionId: null, workoutId: snapshot.logicalSessionId, planId: blockId, revisionId: blockId, policyReferences: snapshot.policyReferences, pathwayReference: snapshot.pathwayReference, completedAt: now, actualDistanceMeters: null, reason: null, source: 'manual', durationReliability: input.actualDurationSeconds === null ? 'unknown' : 'medium', distanceReliability: 'unknown', observedWindow: { start: input.actualDate, end: input.actualDate } };
  let associatedActivitySnapshot: Readonly<Record<string, unknown>> | undefined;
  if (activityId) {
    const activity = (await availableResearchActivities(owner)).find(a => a.id === activityId);
    if (!activity) throw new Error('activity_unavailable_or_not_owned');
    if (input.status === 'missed') throw new Error('skipped_workout_cannot_link_activity');
    if (activity.sourceKind === 'activity_log') {
      associatedActivitySnapshot = { ...activity.log };
      const facts = completionFromActivity(activity.log, input.status === 'partial' ? 'partial' : 'completed', snapshot);
      record = { ...record, ...facts, status: input.status, actualRunningSeconds: input.actualRunningSeconds, difficulty: input.difficulty, fatigue: input.fatigue, discomfort: facts.discomfort === 'pain_or_injury_concern' ? facts.discomfort : input.discomfort, rpe: facts.rpe ?? input.rpe, note: input.note };
    } else {
      associatedActivitySnapshot = { ...activity.tracker };
      record = { ...record, activityLogId: null, actualDate: activity.actualDate, completedAt: new Date(activity.tracker.ended_at_ms).toISOString(), actualDurationSeconds: activity.durationSeconds, actualDistanceMeters: activity.tracker.distance_meters, status: activity.tracker.mode === 'walk' ? 'different_activity' : input.status, actualRunningSeconds: activity.tracker.mode === 'walk' ? null : input.actualRunningSeconds, source: activity.tracker.status_reason === 'timer_only' ? 'timer_only' : 'gps', durationReliability: 'high', distanceReliability: 'unknown' };
    }
  }
  let guidedExecution: ResearchOutcome['guidedExecution'];
  if (activityId?.startsWith('tracking:')) {
    const sessionId = activityId.slice('tracking:'.length);
    const progress = await new GuidedWorkoutProgressRepository(db, owner).get(blockId, assignmentId);
    if (progress?.trackingSessionId === sessionId) {
      if (progress.progress.status !== 'finished' || progress.snapshotFingerprint.length === 0) throw new Error('guided_execution_not_finished');
      guidedExecution = { trackingSessionId: sessionId, snapshotFingerprint: progress.snapshotFingerprint, completedPhases: progress.progress.completedPhases.map(item => ({ ...item })) };
    }
  }
  const outcome: ResearchOutcome = { id, blockId, assignmentId, previousVersionId, removed, associatedActivityId: activityId, recordedAt: now, record, runningDurationSource: record.actualRunningSeconds === null ? 'unknown' : 'manual_report', ...(associatedActivitySnapshot ? { associatedActivitySnapshot } : {}), ...(guidedExecution ? { guidedExecution } : {}) };
  await access(owner); // Reject a changed session after asynchronous evidence reads.
  await repository.saveOutcome(outcome);
}
export async function reassessSavedResearchBlock(owner: string, blockId: string, nextStart: string) {
  const { repository } = await access(owner); const block = await repository.get(blockId);
  if (!block) throw new Error('research_block_not_owned');
  if (!isDateOnly(nextStart)) throw new Error('valid_next_start_date_required');
  const facts = await currentFacts(owner); const outcomes = await repository.outcomes(blockId);
  const constraints = { ...facts.constraints, startDate: nextMondayOnOrAfter(nextStart) };
  const previousBlocks = await repository.blocks();
  const allHistory = (await Promise.all(previousBlocks.map(b => repository.outcomes(b.id)))).flat();
  const evidence = { ...facts.evidence, healthConcern: facts.evidence.healthConcern || allHistory.some(o => o.record.discomfort === 'pain_or_injury_concern') };
  const decision = reassessResearchFoundation(block, outcomes, { evidence, constraints, confirmedAt: facts.draft.foundationEvidenceConfirmedAt ?? '', asOfDate: localDateOnly(), interruption: facts.draft.interruption !== 'none' });
  await access(owner);
  // Store the complete decision input so later reviews are reproducible.
  const decisionId = `research-decision-${Crypto.randomUUID()}`;
  await repository.saveDecision(decisionId, blockId, { decision, currentEvidence: facts, constraints, evaluatedAt: new Date().toISOString() });
  return { decision, decisionId, facts, constraints };
}
/** Explicit action; never publishes or mutates a previous block. Reevaluate to reject stale evidence. */
export async function generateNextResearchBlock(owner: string, blockId: string, nextStart: string) {
  const result = await reassessSavedResearchBlock(owner, blockId, nextStart);
  if (result.decision.kind !== 'next_block' || !result.decision.nextProgram) throw new Error(result.decision.reasonCodes.join(', '));
  const { repository } = await access(owner);
  if ((await currentFacts(owner)).evidenceReference !== result.facts.evidenceReference) throw new Error('runner_evidence_changed_during_reassessment');
  return repository.saveBlock(snapshotResearchBlock({ id: `research-${Crypto.randomUUID()}`, ownerId: owner, evidenceReference: result.facts.evidenceReference, evidence: result.facts.evidence, constraints: result.constraints, program: result.decision.nextProgram, parentBlockId: blockId, createdAt: new Date().toISOString(), transitionProvenance: { decisionId: result.decisionId, policyReference: result.decision.policyReference, sourceOutcomeIds: result.decision.evidenceIds } }));
}
