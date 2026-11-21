import { mkdirSync, writeFileSync } from 'node:fs';
import * as Crypto from 'expo-crypto';
import * as flags from '@/config/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { requireActiveAccountId } from '@/application/localAccount';
import { loadCurrentAccountPlanFacts } from '@/application/planAvailability';
import { openCurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';
import { saveResearchFoundationPreview, loadResearchFoundationHistory, recordResearchOutcome, reassessSavedResearchBlock, generateNextResearchBlock, availableResearchActivities } from '@/application/researchFoundation';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { describeResearchBlock } from '@/domain/planning/researchFoundation';
import { MemoryDatabase } from '../support/memoryDatabase';
import { successfulOutcomes } from '../support/researchFoundationFixtures';
import { openPendingResearchCheckins, openTrackerHistory } from '@/application/trackerHistory';
import { retainPendingResearchCheckin } from '@/application/researchCheckin';
import type { SqlValue } from '@/data/database';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@/config/experimental5kPreview', () => ({ __esModule: true, experimental5kPreviewEnabled: true }));
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn() }));
jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: jest.fn() }));
jest.mock('@/application/planAvailability', () => ({ loadCurrentAccountPlanFacts: jest.fn() }));
jest.mock('@/features/execution/viewModel', () => ({ localDateOnly: (date?: Date) => date ? date.toISOString().slice(0,10) : '2027-02-01' }));
class TrackingTestDatabase extends MemoryDatabase {
  override async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    // The shared lightweight fake aliases activity columns unconditionally.
    // Tracking queries intentionally retain the native snake_case column names.
    if (sql.includes('FROM tracking_sessions')) return this.table('tracking_sessions').filter(r=>r.owner_id===params[0]) as T[];
    return super.getAll<T>(sql,params);
  }
}
let db: MemoryDatabase;
function facts(changes: Partial<FitnessAssessmentDraft> = {}) {
  const draft: FitnessAssessmentDraft = { ...emptyFitnessAssessmentDraft('account-a','Asia/Kolkata'), goal:'half_marathon', weeklyMinutes:'50',comfortableRunMinutes:'45',longestSessionMinutes:'75',longestSessionDate:'2025-01-01',currentTrainingStatus:'currently_training', interruption:'none',planStartDate:'2027-01-04',foundationEvidenceConfirmedAt:'2027-01-01',foundationFrequency:3,trainingDays:[1,3,6],minuteLimits:{1:'45',3:'45',6:'45'},minuteLimitConfirmedDays:[1,3,6],...changes };
  const result={ownerId:draft.ownerId,draft,assessment:assessFitness(draft,'2027-02-01T00:00:00Z'),activeSnapshot:null,pathwayIntent:draft.goal==='half_marathon'?{ownerId:draft.ownerId,goal:'half_marathon' as const,choice:'foundation' as const,schemaVersion:1 as const,revision:1,updatedAt:'2027-01-01T00:00:00.000Z'}:null};
  jest.mocked(loadCurrentAccountPlanFacts).mockResolvedValue(result);return result;
}
beforeEach(()=>{jest.useFakeTimers({doNotFake:['nextTick','setImmediate']});jest.setSystemTime(new Date('2027-02-01T12:00:00Z'));db=new TrackingTestDatabase();let seq=0;jest.mocked(Crypto.randomUUID).mockImplementation(()=>`uuid-${++seq}`);jest.mocked(openAppDatabase).mockResolvedValue(db as never);jest.mocked(requireActiveAccountId).mockResolvedValue('account-a');facts();});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
async function saved(changes: Partial<FitnessAssessmentDraft> = {}) {
  facts(changes);const preview=await openCurrentExperimentalHalfMarathonPreview();if(preview.kind!=='foundation_program')throw new Error('Preview missing');
  const block=await saveResearchFoundationPreview('account-a',preview);
  return {preview,block};
}
test.each(['current','beginner','returning'] as const)('Android-facing %s flow persists facts, reassesses, schedules and restores a successor',async(kind)=>{
  const changes:Partial<FitnessAssessmentDraft>=kind==='current'?{}:{goal:kind==='beginner'?'5k':'half_marathon',currentTrainingStatus:kind==='beginner'?'first_time_runner':'returning_after_break',foundationPostBreakConfirmed:true,weeklyMinutes:'5',comfortableRunMinutes:'0.5',...(kind==='returning'?{interruption:'over_four_weeks',interruptionReason:'schedule_or_travel',lastRunningDate:'2026-11-05'}:{})};
  const {preview,block}=await saved(changes);const original=JSON.stringify(block);
  expect((await saveResearchFoundationPreview('account-a',preview)).id).toBe(block.id);
  const insufficient=await reassessSavedResearchBlock('account-a',block.id,'2027-02-01');expect(insufficient.decision.nextProgram).toBeNull();
  for(const outcome of successfulOutcomes(block))await recordResearchOutcome('account-a',block.id,outcome.assignmentId,null,outcome.record);
  facts({...changes,currentTrainingStatus:'currently_training',interruption:'none',comfortableRunMinutes:kind==='current'?'45':'10',foundationEvidenceConfirmedAt:'2027-02-01'});
  const evaluated=await reassessSavedResearchBlock('account-a',block.id,'2027-02-01');expect(evaluated.decision.kind).toBe('next_block');
  const next=await generateNextResearchBlock('account-a',block.id,'2027-02-01');
  expect(next.program.validation.valid).toBe(true);expect(next.program.weeks).toHaveLength(4);expect(next.parentBlockId).toBe(block.id);
  expect(next.program.goalFamily).toBe(block.program.goalFamily);expect(next.transitionProvenance?.sourceOutcomeIds).toHaveLength(12);
  expect((await generateNextResearchBlock('account-a',block.id,'2027-02-01')).id).toBe(next.id);
  const reloaded=await loadResearchFoundationHistory('account-a');expect(reloaded).toHaveLength(2);expect(JSON.stringify(reloaded[0].block)).toBe(original);
  expect(describeResearchBlock(reloaded[0].block,reloaded[0].outcomes).filter(f=>f.status==='completed')).toHaveLength(12);
  expect(['plans','plan_revisions','session_assignments','activity_logs'].every(t=>db.table(t).length===0)).toBe(true);
  if(process.env.EXPORT_RESEARCH_FOUNDATION==='true') {mkdirSync('artifacts/foundation/reassessment',{recursive:true});writeFileSync(`artifacts/foundation/reassessment/${kind}.json`,JSON.stringify({synthetic:true,researchOnly:true,productionEligible:false,originalBlock:block,performance:describeResearchBlock(block,reloaded[0].outcomes),insufficientEvidence:insufficient.decision,decision:evaluated.decision,nextBlock:next},null,2));}
});
test('linked activity stays immutable, corrections count once and removal preserves a historical health hold',async()=>{
  const {block}=await saved();const record=successfulOutcomes(block)[0];
  await db.run('INSERT INTO activity_logs (id, owner_id, previous_version_id, session_id, actual_date, duration_seconds, distance_meters, intended_effort, reported_effort, source, reasons_json, concern_flags_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',['gps-1','account-a',null,null,'2027-01-05',1600,2000,null,null,'gps','[]','[]','2027-01-05T12:00:00Z']);
  const before=JSON.stringify(db.table('activity_logs'));
  await recordResearchOutcome('account-a',block.id,record.assignmentId,null,{...record.record,discomfort:'pain_or_injury_concern'},'gps-1');
  let history=await loadResearchFoundationHistory('account-a');const first=history[0].outcomes[0];
  expect(first.record.actualDistanceMeters).toBe(2000);expect(first.record.activityLogId).toBe('gps-1');
  await recordResearchOutcome('account-a',block.id,record.assignmentId,first.id,record.record,null,true);
  history=await loadResearchFoundationHistory('account-a');expect(describeResearchBlock(block,history[0].outcomes)[0].status).toBe('unreported');
  expect(JSON.stringify(db.table('activity_logs'))).toBe(before);
  const result=await reassessSavedResearchBlock('account-a',block.id,'2027-02-01');expect(result.decision).toMatchObject({kind:'hold_for_review',healthHold:true});
  if(process.env.EXPORT_RESEARCH_FOUNDATION==='true')writeFileSync('artifacts/foundation/reassessment/health-hold.json',JSON.stringify({synthetic:true,history,result},null,2));
});
test('production guard and changed accounts reject access before any research reads or writes',async()=>{
  jest.replaceProperty(flags,'experimental5kPreviewEnabled',false);
  await expect(loadResearchFoundationHistory('account-a')).rejects.toThrow('research_access_disabled');expect(db.statements).toEqual([]);
  jest.replaceProperty(flags,'experimental5kPreviewEnabled',true);jest.mocked(requireActiveAccountId).mockResolvedValue('account-b');
  await expect(loadResearchFoundationHistory('account-a')).rejects.toThrow('account_changed');
  expect(await loadResearchFoundationHistory('account-b')).toEqual([]);
});
test.each(['run','walk'] as const)('explicitly associates saved standalone GPS %s without inventing running steps or duplicating the recording',async(mode)=>{
  const {block}=await saved();const record=successfulOutcomes(block)[0];
  const start=Date.parse('2027-01-05T12:00:00Z');const end=start+1600000;
  await db.run('INSERT INTO tracking_sessions (id, owner_id, planned_session_id, mode, state, started_at_ms, ended_at_ms, segments_json, distance_meters, status_reason) VALUES (?,?,?,?,?,?,?,?,?,?)',['track-real','account-a',null,mode,'saved',start,end,JSON.stringify([{startedAtMs:start,endedAtMs:end}]),1500,'gps']);
  const before=JSON.stringify(db.table('tracking_sessions'));
  expect((await availableResearchActivities('account-a')).map(a=>a.id)).toContain('tracking:track-real');
  expect(describeResearchBlock(block,(await loadResearchFoundationHistory('account-a'))[0]!.outcomes)[0]!.status).toBe('unreported');
  await recordResearchOutcome('account-a',block.id,record.assignmentId,null,{...record.record,actualRunningSeconds:null},'tracking:track-real');
  const stored=(await loadResearchFoundationHistory('account-a'))[0].outcomes[0];
  expect(stored.record).toMatchObject({actualDurationSeconds:1600,actualRunningSeconds:null,actualDistanceMeters:1500,status:mode==='walk'?'different_activity':'completed',activityLogId:null,distanceReliability:'unknown'});
  await expect(recordResearchOutcome('account-a',block.id,block.assignments[1].assignmentId,null,record.record,'tracking:track-real')).rejects.toThrow('already_associated');
  expect(JSON.stringify(db.table('tracking_sessions'))).toBe(before);expect(db.table('activity_logs')).toEqual([]);
});

test('GPS completion stays pending until feedback is submitted, then History restores one linked activity after reload',async()=>{
  const {block}=await saved();const assignment=block.assignments[0]!;const start=Date.parse(`${assignment.plannedDate}T10:00:00Z`);const end=start+1800000;
  await db.run('INSERT INTO tracking_sessions (id, owner_id, planned_session_id, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',['track-feedback','account-a',null,'run','saved',start,end,end,JSON.stringify([{startedAtMs:start,endedAtMs:end}]),4200,1,'gps']);
  const activityBefore=JSON.stringify(db.table('tracking_sessions'));
  await db.transaction(()=>retainPendingResearchCheckin(db,'account-a','track-feedback',block.id,assignment.assignmentId,'2027-01-06T10:30:00Z'));
  expect(await openPendingResearchCheckins()).toEqual([{activityId:'tracking:track-feedback',blockId:block.id,assignmentId:assignment.assignmentId,plannedDate:assignment.plannedDate}]);
  expect((await openTrackerHistory())[0]?.researchFeedback).toBeUndefined();
  await recordResearchOutcome('account-a',block.id,assignment.assignmentId,null,{status:'completed',actualDate:assignment.plannedDate,actualDurationSeconds:1800,actualRunningSeconds:null,rpe:4,difficulty:'comfortable',fatigue:'none',discomfort:'none',note:'Felt steady.'},'tracking:track-feedback');
  const reloadedHistory=await openTrackerHistory();
  expect(await openPendingResearchCheckins()).toEqual([]);
  expect(reloadedHistory).toHaveLength(1);
  expect(reloadedHistory[0]?.researchFeedback).toMatchObject({status:'completed',difficulty:'comfortable',rpe:4,fatigue:'none',discomfort:'none',note:'Felt steady.'});
  expect(reloadedHistory[0]?.distanceMeters).toBe(4200);
  expect(JSON.stringify(db.table('tracking_sessions'))).toBe(activityBefore);
  expect(db.table('research_foundation_outcomes')).toHaveLength(1);
  expect(db.table('plans')).toHaveLength(0);
});
