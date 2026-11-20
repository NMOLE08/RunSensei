import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlValue } from '@/data/database';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { publishAuthorizedPolicyWeek } from '@/application/publishAuthorizedPolicyWeek';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { syntheticHalfConstraints, syntheticHalfPolicy } from '../domain/multiDistancePolicy.test';

/** Real SQLite SQL/uniqueness/rollback tests; not an Android device test. */
class TestSqlite implements SqlDatabase {
  native = new DatabaseSync(':memory:');
  failOn: string | null = null;
  async run(sql: string, params: SqlValue[] = []) {
    if (this.failOn && sql.includes(this.failOn)) throw new Error('Injected write failure');
    const result = this.native.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirst<T>(sql: string, params: SqlValue[] = []) { return (this.native.prepare(sql).get(...params) as T) ?? null; }
  async getAll<T>(sql: string, params: SqlValue[] = []) { return this.native.prepare(sql).all(...params) as T[]; }
  async transaction<T>(operation: () => Promise<T>) {
    this.native.exec('BEGIN IMMEDIATE');
    try { const result = await operation(); this.native.exec('COMMIT'); return result; }
    catch(error) { this.native.exec('ROLLBACK'); throw error; }
  }
  async exclusiveTransaction<T>(operation: (db: SqlDatabase) => Promise<T>) { return this.transaction(() => operation(this)); }
}
const now='2027-01-01T00:00:00Z';
const request = {
  policyId:syntheticHalfPolicy.id,policyVersion:syntheticHalfPolicy.version,goalFamily:'half_marathon' as const,weekNumber:1,inputFingerprint:'confirmed-input',generationKey:'stable-program',constraints:syntheticHalfConstraints,
  profile:{id:'onboarding-profile',units:'metric' as const,trainingTimezone:'UTC',baselineJson:'{}',version:1,createdAt:now,updatedAt:now},
  goal:{id:'onboarding-goal',profileId:'onboarding-profile',mode:'flexible' as const,distanceMeters:21097.5,raceDate:null,startDate:'2027-01-04' as const,version:1,createdAt:now},
  availability:{id:'onboarding-availability',profileId:'onboarding-profile',weekdayLimitsJson:'{}',preferredLongRunDay:6,exceptionsJson:'[]',version:1,createdAt:now},
};
const context={now:()=>now,id:()=> 'unused',allowTestPolicies:true};
const registry=new MultiDistancePolicyRegistry([syntheticHalfPolicy]);
let db:TestSqlite;
beforeEach(async()=>{db=new TestSqlite();await migrate(db,now);});
afterEach(()=>db.native.close());

test('real primary keys protect concurrent publication; reopening repository returns same assignments',async()=>{
  const results=await Promise.all([1,2,3].map(()=>publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context)));
  expect(results.map(r=>r.kind==='published'&&r.applied).filter(Boolean)).toHaveLength(1);
  expect(await db.getFirst('SELECT COUNT(*) AS count FROM session_assignments')).toEqual({count:3});
  expect(await db.getFirst('SELECT COUNT(*) AS count FROM plans')).toEqual({count:1});
  const first=results[0];if(first?.kind!=='published')throw new Error('Expected published');
  expect(await new TrainingRepository(db,'owner-a').getPlanSnapshot(first.snapshot.plan.id)).toEqual(first.snapshot);
  expect(await new TrainingRepository(db,'owner-b').getPlanSnapshot(first.snapshot.plan.id)).toBeNull();
  expect(await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,{...request,inputFingerprint:'new-input'},context)).toMatchObject({kind:'blocked',reasonCodes:['publication_revision_conflict']});
  expect(await db.getFirst('SELECT COUNT(*) AS count FROM session_assignments')).toEqual({count:3});
});
test('late failure rolls back claim and every assignment; retry succeeds',async()=>{
  db.failOn='INSERT INTO audit_events';
  await expect(publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context)).rejects.toThrow('Injected write failure');
  for(const table of ['plans','plan_revisions','session_assignments','logical_sessions','runner_profiles']) expect(await db.getFirst(`SELECT COUNT(*) AS count FROM ${table}`)).toEqual({count:0});
  db.failOn=null;
  expect(await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context)).toMatchObject({kind:'published',applied:true});
});
test('advanced revision cannot be overwritten by initial publication retry',async()=>{
  const first=await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context);
  if(first.kind!=='published')throw new Error('Expected published');
  await db.run('UPDATE plans SET active_revision_id = ? WHERE id = ?',['later-revision',first.snapshot.plan.id]);
  expect(await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context)).toMatchObject({kind:'blocked',reasonCodes:['publication_revision_conflict']});
  expect(await db.getFirst('SELECT active_revision_id FROM plans WHERE id = ?',[first.snapshot.plan.id])).toEqual({active_revision_id:'later-revision'});
});
test('same requested generation key remains account scoped and no future week can publish',async()=>{
  await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,request,context);
  const other={...request,constraints:{...request.constraints,ownerId:'owner-b'}};
  expect(await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-b'),registry,other,context)).toMatchObject({kind:'published'});
  expect(await db.getFirst('SELECT COUNT(*) AS count FROM plans')).toEqual({count:2});
  expect(await db.getFirst('SELECT COUNT(*) AS count FROM session_assignments')).toEqual({count:6});
  expect(await publishAuthorizedPolicyWeek(new TrainingRepository(db,'owner-a'),registry,{...request,weekNumber:2},context)).toMatchObject({kind:'blocked',reasonCodes:['initial_publication_requires_week_one']});
});
