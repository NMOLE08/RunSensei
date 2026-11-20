import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { requireActiveAccountId } from '@/application/localAccount';
import { recoverTracker, startTracker, pauseTracker, resumeTracker, finishTracker, type TrackerSnapshot } from '@/application/workoutTracker';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { loadGuidedWorkoutExecution, startGuidedWorkout, pauseGuidedWorkout, resumeGuidedWorkout, finishGuidedWorkout } from '@/application/guidedWorkoutExecution';
import { dispatchGuidedCue } from '@/application/guidedWorkoutCues';
import { recordResearchOutcome, type ResearchOutcomeInput } from '@/application/researchFoundation';
import { researchBlock } from '../support/researchFoundationFixtures';
import { MemoryDatabase } from '../support/memoryDatabase';
import type { SqlValue } from '@/data/database';

jest.mock('@/config/experimental5kPreview',()=>({experimental5kPreviewEnabled:true}));
jest.mock('@/data/expoSqliteDatabase',()=>({openAppDatabase:jest.fn()}));
jest.mock('@/data/migrations',()=>({migrate:jest.fn(async()=>undefined)}));
jest.mock('@/application/localAccount',()=>({requireActiveAccountId:jest.fn()}));
jest.mock('@/application/workoutTracker',()=>({recoverTracker:jest.fn(),startTracker:jest.fn(),pauseTracker:jest.fn(),resumeTracker:jest.fn(),finishTracker:jest.fn(),subscribeTracker:jest.fn()}));
jest.mock('@/application/guidedWorkoutCues',()=>({dispatchGuidedCue:jest.fn(async()=>undefined),emitGuidedProgressCues:jest.fn(async()=>undefined),cancelGuidedCuesForFinish:jest.fn(async()=>undefined),recoverGuidedCueReceipts:jest.fn(async()=>undefined)}));

class GuidedDatabase extends MemoryDatabase {
  override async getAll<T>(sql:string,params:SqlValue[]=[]):Promise<T[]>{
    if(sql.includes('FROM tracking_sessions')) return this.table('tracking_sessions').filter(row=>row.owner_id===params[0]) as T[];
    return super.getAll<T>(sql,params);
  }
  override async getFirst<T>(sql:string,params:SqlValue[]=[]):Promise<T|null>{
    if(sql.includes('FROM research_guided_progress')){const rows=this.table('research_guided_progress');const row=sql.includes('assignment_id = ?')?rows.find(r=>r.owner_id===params[0]&&r.block_id===params[1]&&r.assignment_id===params[2]):rows.find(r=>r.owner_id===params[0]&&r.tracking_session_id===params[1]);return (row as T|undefined)??null;}
    return super.getFirst<T>(sql,params);
  }
  override async run(sql:string,params:SqlValue[]=[]){
    if(sql.startsWith('INSERT INTO research_guided_progress')){const names=['id','owner_id','block_id','assignment_id','tracking_session_id','snapshot_fingerprint','revision','progress_json','updated_at'];const row=Object.fromEntries(names.map((n,i)=>[n,params[i]]));const rows=this.table('research_guided_progress');if(rows.some(r=>r.owner_id===row.owner_id&&r.block_id===row.block_id&&r.assignment_id===row.assignment_id))throw new Error('duplicate guided progress');return super.run(sql,params);}
    if(sql.startsWith('UPDATE research_guided_progress')){const[progress_json,revision,updated_at,id,owner_id,expected]=params;const row=this.table('research_guided_progress').find(r=>r.id===id&&r.owner_id===owner_id&&r.revision===expected);if(!row)return{changes:0,lastInsertRowId:0};Object.assign(row,{progress_json,revision,updated_at});return{changes:1,lastInsertRowId:0};}
    return super.run(sql,params);
  }
}
let db:GuidedDatabase;let tracker:TrackerSnapshot|null;let clock:number;
beforeEach(async()=>{
  jest.clearAllMocks();db=new GuidedDatabase();tracker=null;clock=Date.now();jest.mocked(openAppDatabase).mockResolvedValue(db as never);jest.mocked(requireActiveAccountId).mockResolvedValue('account-a');
  jest.mocked(recoverTracker).mockImplementation(async()=>tracker);
  jest.mocked(startTracker).mockImplementation(async(input)=>{tracker={session:{id:'gps-session-1',ownerId:'account-a',plannedSessionId:null,prescriptionSnapshot:input.prescription??null,mode:input.mode,status:'recording',startedAtMs:clock,endedAtMs:null,segments:[{startedAtMs:clock,endedAtMs:null}],distanceMeters:0,metricVersion:1},revisionId:null,track:{points:[],distanceMeters:0,lastPoint:null},timerOnly:false,message:null,researchCheckIn:input.researchCheckIn} as TrackerSnapshot;});
  jest.mocked(pauseTracker).mockImplementation(async()=>{if(tracker){tracker={...tracker,session:{...tracker.session,status:'paused',segments:tracker.session.segments.map(s=>s.endedAtMs===null?{...s,endedAtMs:clock+5000}:s)}};}});
  jest.mocked(resumeTracker).mockImplementation(async()=>{if(tracker)tracker={...tracker,session:{...tracker.session,status:'recording',segments:[...tracker.session.segments,{startedAtMs:clock+6000,endedAtMs:null}]}};});
  jest.mocked(finishTracker).mockImplementation(async()=>{if(!tracker)throw new Error('missing');tracker={...tracker,session:{...tracker.session,status:'saved',endedAtMs:clock+10000,segments:tracker.session.segments.map(s=>s.endedAtMs===null?{...s,endedAtMs:clock+10000}:s)}};return tracker;});
  await new ResearchFoundationRepository(db,'account-a').saveBlock(researchBlock(undefined,undefined,'block-a'));
});

test('starts one GPS session from the exact account-owned saved assignment, persists progress and resumes same session',async()=>{
  const block=researchBlock(undefined,undefined,'block-a');const assignment=block.assignments[0]!;
  const ready=await loadGuidedWorkoutExecution('account-a',block.id,assignment.assignmentId);expect(ready.progress.status).toBe('ready');expect(ready.workout.assignment.assignmentId).toBe(assignment.assignmentId);
  const [first,second]=await Promise.all([startGuidedWorkout('account-a',block.id,assignment.assignmentId),startGuidedWorkout('account-a',block.id,assignment.assignmentId)]);
  expect(jest.mocked(startTracker)).toHaveBeenCalledTimes(1);expect(first.tracker?.session.id).toBe(second.tracker?.session.id);expect(db.table('research_guided_progress')).toHaveLength(1);
  await pauseGuidedWorkout('account-a',block.id,assignment.assignmentId);expect((await loadGuidedWorkoutExecution('account-a',block.id,assignment.assignmentId)).progress.status).toBe('paused');
  const resumed=await resumeGuidedWorkout('account-a',block.id,assignment.assignmentId);expect(resumed.progress.status).toBe('running');expect(resumed.tracker?.session.id).toBe('gps-session-1');
  const finished=await finishGuidedWorkout('account-a',block.id,assignment.assignmentId);expect(finished.progress.status).toBe('finished');expect(finished.tracker.session.id).toBe('gps-session-1');expect(finished.productionEligible).toBe(false);
  expect(await finishGuidedWorkout('account-a',block.id,assignment.assignmentId)).toMatchObject({progress:{status:'finished'},tracker:{session:{id:'gps-session-1',status:'saved'}}});
  expect(['plans','plan_revisions','session_assignments','activity_logs'].every(name=>db.table(name).length===0)).toBe(true);
  expect(jest.mocked(dispatchGuidedCue).mock.calls.map(([,event])=>event.kind)).toEqual(['workout_start','pause','resume']);
});

test('account switching and mismatched assignment cannot read or start guided progress',async()=>{
  const block=researchBlock(undefined,undefined,'block-a');const assignment=block.assignments[0]!;
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-b');await expect(loadGuidedWorkoutExecution('account-a',block.id,assignment.assignmentId)).rejects.toThrow('account changed');
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-a');await expect(startGuidedWorkout('account-a',block.id,'foreign:w1:A')).rejects.toThrow('research_assignment_not_owned');expect(startTracker).not.toHaveBeenCalled();
});

test('finish-before-progress crash is reconciled from the saved session and feedback keeps phase evidence',async()=>{
  const block=researchBlock(undefined,undefined,'block-a');const assignment=block.assignments[0]!;
  await startGuidedWorkout('account-a',block.id,assignment.assignmentId);
  await finishTracker(); // Simulate process exit before guided progress could be finalized.
  const recovered=await loadGuidedWorkoutExecution('account-a',block.id,assignment.assignmentId);
  expect(recovered.progress.status).toBe('finished');expect(recovered.tracker?.session.id).toBe('gps-session-1');
  const finishedTracker=recovered.tracker!;
  await db.run('INSERT INTO tracking_sessions (id, owner_id, planned_session_id, revision_id, prescription_json, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
    finishedTracker.session.id,'account-a',null,null,finishedTracker.session.prescriptionSnapshot,'run','saved',clock,clock+10000,clock+10000,JSON.stringify(finishedTracker.session.segments),0,1,'gps',
  ]);
  const feedback:ResearchOutcomeInput={status:'completed',actualDate:new Date(clock).toISOString().slice(0,10),actualDurationSeconds:10,actualRunningSeconds:null,rpe:3,difficulty:'comfortable',fatigue:'none',discomfort:'none',note:null};
  await recordResearchOutcome('account-a',block.id,assignment.assignmentId,null,feedback,'tracking:gps-session-1');
  const outcome=JSON.parse(db.table('research_foundation_outcomes')[0]!.payload_json as string) as {guidedExecution?:{trackingSessionId:string;completedPhases:unknown[]};record:{actualRunningSeconds:number|null}};
  expect(outcome.guidedExecution?.trackingSessionId).toBe('gps-session-1');expect(outcome.guidedExecution?.completedPhases).toBeDefined();expect(outcome.record.actualRunningSeconds).toBeNull();
});
