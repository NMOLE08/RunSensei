import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { CURRENT_TRAINING_EPISODE_ID, ResearchWeeklyEvidenceRepository, type WeeklyCoverageState } from '@/data/researchWeeklyEvidenceRepository';
import { migrate } from '@/data/migrations';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { normalizeFitnessAssessmentDraft } from '@/domain/assessment/types';
import { buildWeeklyEvidenceLedger, classifyLedgerSessionsByEpisode, normalizeBeginner5kEvidence, researchLedgerSessions, type LedgerSession } from '@/domain/planning/beginner5kRunnerEvidence';
import { activeSeconds, type RecordingSegment } from '@/domain/tracking/session';
import { currentResearchOutcomes, type ResearchOutcome } from '@/domain/planning/researchFoundation';
import { beginnerFoundationReference, previewBeginner5kWeek } from '@/domain/planning/beginner5kWeeklyDecision';
import { nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { requireActiveAccountId } from './localAccount';
import { currentInputs } from './researchFoundation';

/** Local reads only: no migration, decision save, assignment write, or remote fallback. */
export async function loadBeginner5kWeeklyPreview(owner: string, options: { evaluatedOn: string; week: number; blockId?: string; nextStart?: string; expectedFingerprint?: string }) {
  const unavailable = (reason: string) => ({ kind: 'unavailable' as const, reasons: [reason], researchOnly: true as const, productionEligible: false as const });
  if (!experimental5kPreviewEnabled) return unavailable('research_access_disabled');
  const read = async () => {
    if (await requireActiveAccountId() !== owner) throw new Error('account_changed');
    const db = await openAppDatabase();
    const assessments = new FitnessAssessmentRepository(db, owner);
    const raw = await assessments.loadDraft(); if (!raw) throw new Error('local_runner_evidence_missing');
    const draft = normalizeFitnessAssessmentDraft(raw);
    if (draft.ownerId !== owner) throw new Error('account_changed');
    if (!await assessments.resultForInputFingerprint(assessmentEvidenceFingerprint(draft))) throw new Error('current_account_assessment_required');
    const { evidence, constraints } = currentInputs(draft, owner);
    const repository = new ResearchFoundationRepository(db, owner);
    const weeklyRepo = new ResearchWeeklyEvidenceRepository(db, owner);
    const savedWeeks = await weeklyRepo.weeks();
    const episode = await weeklyRepo.episode();
    const block = options.blockId ? await repository.get(options.blockId) : null;
    if (options.blockId && !block) throw new Error('research_block_not_owned');
    const outcomes = block ? await repository.outcomes(block.id) : [];
    // A prior reported health concern stays visible even in a different saved block.
    const allOutcomes: ResearchOutcome[] = [];
    const unreported: LedgerSession[] = [];
    for (const b of await repository.blocks()) {
      if (b.ownerId !== owner) throw new Error('account_changed');
      const history = await repository.outcomes(b.id); allOutcomes.push(...history);
      if (history.some(o => o.record.discomfort === 'pain_or_injury_concern')) evidence.healthConcern = true;
      let current: ResearchOutcome[] = [];
      try { current = currentResearchOutcomes(history); } catch { /* Projection below reports invalid correction history. */ }
      // Missing outcomes remain unknown; planned steps are never actual performance.
      for (const a of b.assignments) if (!current.some(o => o.assignmentId === a.assignmentId)) unreported.push({ id: a.assignmentId, ownerId: owner, activityId: null, source: 'research_outcome', localDate: a.plannedDate, timezone: draft.timezone, episodeId: null, runningSeconds: null, walkingSeconds: null, gpsElapsedSeconds: null, runningExplicit: false, status: 'unreported', reliability: 'unknown' });
    }
    if (block) { const nextStart = options.nextStart ?? ''; if (!isDateOnly(nextStart)) throw new Error('valid_next_start_date_required'); constraints.startDate = nextMondayOnOrAfter(nextStart); }
    const normalized = normalizeBeginner5kEvidence(draft, evidence, constraints, options.evaluatedOn, block, outcomes);
    const projected = researchLedgerSessions(owner, draft.timezone, allOutcomes);
    const tracked = await db.getAll<{ id: string; owner_id: string; started_at_ms: number; ended_at_ms: number; segments_json: string; status_reason: string | null }>('SELECT id, owner_id, started_at_ms, ended_at_ms, segments_json, status_reason FROM tracking_sessions WHERE owner_id = ? AND state = ?', [owner, 'saved']);
    const gps: LedgerSession[] = tracked.map(t => {
      let elapsed: number | null = null;
      try { const segments = JSON.parse(t.segments_json) as RecordingSegment[]; if (Array.isArray(segments) && segments.length && segments.every(s => Number.isFinite(s.startedAtMs) && s.endedAtMs !== null && Number.isFinite(s.endedAtMs) && s.endedAtMs >= s.startedAtMs) && Number.isFinite(t.ended_at_ms)) elapsed = activeSeconds(segments, t.ended_at_ms); } catch { /* Unknown duration stays unknown. */ }
      return { id: `tracking:${t.id}`, ownerId: t.owner_id, activityId: `tracking:${t.id}`, source: 'gps', localDate: null, instant: Number.isFinite(t.started_at_ms) ? new Date(t.started_at_ms).toISOString() : '', timezone: draft.timezone, episodeId: null, runningSeconds: null, walkingSeconds: null, gpsElapsedSeconds: t.status_reason === 'timer_only' ? null : elapsed, runningExplicit: false, status: 'completed', reliability: 'unknown' };
    });
    const currentEpisode=episode?.status==='current'&&episode.startedOn ? episode : null;
    const currentEpisodeStart=currentEpisode?.startedOn ?? null;
    const coverage = savedWeeks.map(item => ({ ownerId: item.ownerId, weekStart: item.weekStart, timezone: item.timezone, episodeId:currentEpisode&&currentEpisodeStart&&item.observationEnd<currentEpisodeStart ? `historical-before:${currentEpisode.id}` : item.episodeId, sourceId: item.sourceId, coverage: item.coverage }));
    const sessions=classifyLedgerSessionsByEpisode([...projected.sessions,...unreported,...gps],episode,draft.timezone);
    normalized.weeklyLedger = buildWeeklyEvidenceLedger({ ownerId: owner, targetWeek: constraints.startDate, evaluatedOn: options.evaluatedOn, timezone: draft.timezone, episodeId: currentEpisode?.id ?? null, interruption: normalized.interruption && !currentEpisode, trainingContext: { status: evidence.context, lastRunningDate: draft.lastRunningDate || null, interruptionReason: draft.interruptionReason }, sessions, coverage, lineage: projected.lineage });
    if (!currentEpisode) normalized.weeklyLedger.issues.push('training_episode_boundary_unknown');
    normalized.weeklyLedger.issues.push(...projected.issues);
    const evidenceRevisionIdentity={weeklyConfirmations:savedWeeks.map(i=>`${i.weekStart}:${i.revision}:${i.coverage}:${i.sourceId}`).sort(),trainingEpisode:episode ? `${episode.id}:${episode.revision}:${episode.status}:${episode.startedOn??'unknown'}` : 'none'};
    return { evidence: normalized, block, outcomes, week: options.week, policyReference: beginnerFoundationReference, savedWeeks, episode, evidenceRevisionIdentity };
  };
  try {
    const firstRead = await read();
    const first = previewBeginner5kWeek({ ...firstRead, expectedFingerprint: options.expectedFingerprint, evidenceRevisionIdentity:firstRead.evidenceRevisionIdentity });
    const secondRead = await read();
    const second = previewBeginner5kWeek({...secondRead,evidenceRevisionIdentity:secondRead.evidenceRevisionIdentity});
    if (await requireActiveAccountId() !== owner) return unavailable('account_changed');
    if (first.fingerprint !== second.fingerprint) return unavailable('runner_evidence_changed_during_preview');
    return { ...first, weeklyConfirmations: firstRead.savedWeeks, trainingEpisode: firstRead.episode };
  } catch (error) { return unavailable(error instanceof Error ? error.message : 'local_evidence_read_failed'); }
}

export type SaveTrainingEpisodeInput={startedOn:string|null;timezone:string;expectedRevision:number;evaluatedOn:string};
export type SaveTrainingEpisodeResult={ok:true;revision:number;status:'current'|'unknown';startedOn:string|null}|{ok:false;error:string;stale:boolean};
export async function saveBeginner5kTrainingEpisode(owner:string,input:SaveTrainingEpisodeInput):Promise<SaveTrainingEpisodeResult>{
  try {
    if(!experimental5kPreviewEnabled) throw new Error('research_access_disabled');
    if(await requireActiveAccountId()!==owner) throw new Error('account_changed');
    if(!isDateOnly(input.evaluatedOn)||!input.timezone||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||(input.startedOn!==null&&(!isDateOnly(input.startedOn)||input.startedOn>input.evaluatedOn))) throw new Error('invalid_training_episode');
    const db=await openAppDatabase(); await migrate(db,new Date().toISOString());
    const assessments=new FitnessAssessmentRepository(db,owner); const raw=await assessments.loadDraft(); if(!raw) throw new Error('local_runner_evidence_missing');
    const draft=normalizeFitnessAssessmentDraft(raw); if(draft.ownerId!==owner||draft.timezone!==input.timezone) throw new Error('account_or_timezone_changed');
    if(!await assessments.resultForInputFingerprint(assessmentEvidenceFingerprint(draft))) throw new Error('current_account_assessment_required');
    if(await requireActiveAccountId()!==owner) throw new Error('account_changed');
    const repository=new ResearchWeeklyEvidenceRepository(db,owner); const status=input.startedOn===null?'unknown' as const:'current' as const;
    const value=await repository.saveEpisode({id:CURRENT_TRAINING_EPISODE_ID,ownerId:owner,status,startedOn:input.startedOn,interruptionDate:null,reason:null,timezone:input.timezone},input.expectedRevision);
    return {ok:true,revision:value.revision,status:value.status as 'current'|'unknown',startedOn:value.startedOn};
  } catch(error){const message=error instanceof Error?error.message:'training_episode_save_failed'; return {ok:false,error:message,stale:message.includes('stale_episode_revision')};}
}

export type SaveWeeklyEvidenceInput = { weekStart: string; timezone: string; coverage: WeeklyCoverageState; expectedRevision: number; evaluatedOn: string; blockId?: string; nextStart?: string };
export type SaveWeeklyEvidenceResult = { ok: true; revision: number; coverage: WeeklyCoverageState } | { ok: false; error: string; stale: boolean };

/** Explicit research action. It appends evidence metadata and never writes workouts or activity facts. */
export async function saveBeginner5kWeeklyConfirmation(owner: string, input: SaveWeeklyEvidenceInput): Promise<SaveWeeklyEvidenceResult> {
  try {
    if (!experimental5kPreviewEnabled) throw new Error('research_access_disabled');
    if (await requireActiveAccountId() !== owner) throw new Error('account_changed');
    if (!isDateOnly(input.weekStart) || !isDateOnly(input.evaluatedOn) || !input.timezone || !['complete','confirmed_no_running','partial','unknown'].includes(input.coverage) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('invalid_weekly_confirmation');
    const db=await openAppDatabase(); await migrate(db,new Date().toISOString());
    const preview = await loadBeginner5kWeeklyPreview(owner,{ evaluatedOn:input.evaluatedOn, week:1, blockId:input.blockId, nextStart:input.nextStart });
    if (!('evidence' in preview)) throw new Error(preview.reasons[0] ?? 'weekly_evidence_unavailable');
    const window = preview.startingWorkloadComparison.ledger.weeks.find(item => item.start === input.weekStart);
    if (!window || window.timezone !== input.timezone) throw new Error('week_not_in_current_observation_window');
    if (input.coverage === 'confirmed_no_running' && (window.runningSubtotalSeconds ?? 0) > 0) throw new Error('confirmed_zero_conflicts_with_running_evidence');
    if (await requireActiveAccountId() !== owner) throw new Error('account_changed');
    const repository=new ResearchWeeklyEvidenceRepository(db,owner); const episode=await repository.episode();
    const now=new Date().toISOString();
    const value=await repository.save({ ownerId:owner, weekStart:input.weekStart, observationEnd:window.end, timezone:input.timezone, episodeId:input.coverage === 'unknown' ? null : episode?.id ?? null, sourceId:`weekly-confirmation:${input.weekStart}:r${input.expectedRevision+1}`, coverage:input.coverage, confirmedAt:now },input.expectedRevision);
    return {ok:true,revision:value.revision,coverage:value.coverage};
  } catch(error) {
    const message=error instanceof Error ? error.message : 'weekly_confirmation_save_failed';
    return {ok:false,error:message,stale:message.includes('stale_weekly_evidence_revision')};
  }
}
