import { getCurrentBeginner5kPublicationStatus, publishCurrentBeginner5kWeekOne, publicationBlockedStatus } from '@/application/currentBeginner5kPublication';
import { loadCurrentAccountPlanFacts } from '@/application/planAvailability';
import { acquirePublicationAccount } from '@/services/account/publicationAccount';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { policyAuthorizationConfig } from '@/config/policyAuthorization';
import { MemoryDatabase } from '../support/memoryDatabase';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { signedReleaseFixture,releaseTestDraft,releaseTestTime } from '../support/releaseApprovalFixtures';
import * as SecureStore from 'expo-secure-store';

jest.mock('@/application/planAvailability',()=>({loadCurrentAccountPlanFacts:jest.fn()}));
jest.mock('@/services/account/publicationAccount',()=>({acquirePublicationAccount:jest.fn()}));
jest.mock('@/data/expoSqliteDatabase',()=>({openAppDatabase:jest.fn()}));
jest.mock('@/config/policyAuthorization',()=>({policyAuthorizationConfig:{endpoint:null,roots:[]},authorizationClockSkewMs:300000,authorizationRequestTimeoutMs:15000}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(async()=>null),setItemAsync:jest.fn(async()=>undefined)}));
let f:Awaited<ReturnType<typeof signedReleaseFixture>>;let db:MemoryDatabase;let account:string|null;
const originalFetch=globalThis.fetch;
beforeAll(async()=>{f=await signedReleaseFixture();});
beforeEach(async()=>{
  jest.useFakeTimers({doNotFake:['nextTick','setImmediate']});jest.setSystemTime(new Date(releaseTestTime));
  db=new MemoryDatabase();account='owner-a';
  (openAppDatabase as jest.Mock).mockResolvedValue(db);
  (loadCurrentAccountPlanFacts as jest.Mock).mockResolvedValue({ownerId:'owner-a',draft:releaseTestDraft,assessment:f.assessment,activeSnapshot:null});
  (acquirePublicationAccount as jest.Mock).mockImplementation(async()=>({ownerId:'owner-a',assertCurrent:async()=>{if(account!=='owner-a')throw new Error('publication_account_changed');},dispose:jest.fn()}));
  await new FitnessAssessmentRepository(db,'owner-a').saveDraft(releaseTestDraft);
  Object.assign(policyAuthorizationConfig,{endpoint:'https://test.invalid/release',roots:[f.root]});
  let secureState:string|null=null;
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async()=>secureState);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async(_key,value)=>{secureState=value;});
  globalThis.fetch=jest.fn(async(_url,options:any)=>({ok:true,json:async()=>f.signTrust({...f.payload,requestNonce:JSON.parse(options.body).nonce})})) as any;
});
afterEach(()=>{globalThis.fetch=originalFetch;jest.useRealTimers();});
test('status checks do not publish; explicit account-owned action saves only three and reloads',async()=>{
  expect(await getCurrentBeginner5kPublicationStatus()).toMatchObject({status:{code:'preview_available'},canPublish:true});
  expect(db.table('plans')).toHaveLength(0);
  const result=await publishCurrentBeginner5kWeekOne();
  expect(result.status.code).toBe('plan_ready');expect(result.snapshot?.assignments).toHaveLength(3);
  expect(db.table('plans')[0]?.owner_id).toBe('owner-a');
  expect(await publishCurrentBeginner5kWeekOne()).toMatchObject({status:{code:'plan_ready'},snapshot:result.snapshot});
  expect(db.table('session_assignments')).toHaveLength(3);
});
test('two authenticated concurrent actions persist one week',async()=>{
  const results=await Promise.all([publishCurrentBeginner5kWeekOne(),publishCurrentBeginner5kWeekOne()]);
  expect(results.map(r=>r.status.code)).toEqual(['plan_ready','plan_ready']);
  expect(results[0]!.snapshot).toEqual(results[1]!.snapshot);expect(db.table('plans')).toHaveLength(1);
});
test('no supplied real trust means blocked and no action',async()=>{
  Object.assign(policyAuthorizationConfig,{endpoint:null,roots:[]});
  const result=await publishCurrentBeginner5kWeekOne();
  expect(result).toMatchObject({status:{code:'policy_approval_pending',nextAction:{destination:'/plan'}},canPublish:false,preview:{kind:'preview'}});
  expect(result.preview?.sessions).toHaveLength(36);
  expect(db.table('plans')).toHaveLength(0);
});
test('network loss or stored trust rollback fail closed instead of trusting cached non-revocation',async()=>{
  (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  expect(await publishCurrentBeginner5kWeekOne()).toMatchObject({status:{code:'production_authorization_failure'},canPublish:false});
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('2');
  expect(await publishCurrentBeginner5kWeekOne()).toMatchObject({status:{diagnostics:{reasonCodes:['trust_replay_or_rollback']}},canPublish:false});
  expect(db.table('plans')).toHaveLength(0);
});
test('missing evidence identifies source field and existing focused screen',async()=>{
  (loadCurrentAccountPlanFacts as jest.Mock).mockResolvedValue({ownerId:'owner-a',draft:null,assessment:null,activeSnapshot:null});
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('more_information_needed');
  expect(publicationBlockedStatus(['missing_adult_age_confirmed'])).toMatchObject({code:'more_information_needed',recovery:{field:'adultAgeConfirmed',destination:expect.stringContaining('part=first5-check')}});
  expect(publicationBlockedStatus(['health_concern_reported']).code).toBe('health_review_required');
  expect(publicationBlockedStatus(['assessment_missing_or_outdated']).code).toBe('reassessment_required');
});
test('explains each blocked 5K reason with its own focused recovery destination',()=>{
  const assessment=publicationBlockedStatus(['assessment_missing_or_outdated']);
  expect(assessment).toMatchObject({
    code:'reassessment_required',activePlan:false,
    title:'Review your current starting point',
    message:expect.stringContaining('starting-point review'),
    nextAction:{destination:'/onboarding/assessment?returnTo=/plan'},
    recovery:{field:'assessment',destination:'/onboarding/assessment?returnTo=/plan',actionLabel:'Review current assessment'},
  });

  const interruption=publicationBlockedStatus(['interruption_requires_review']);
  expect(interruption).toMatchObject({
    code:'reassessment_required',activePlan:false,
    title:'Review your recent interruption',
    message:expect.stringContaining('recent interruption'),
    nextAction:{destination:'/onboarding/running?part=running-interruption&focus=recent-interruption&returnTo=/plan'},
    recovery:{field:'interruption',actionLabel:'Review recent interruption'},
  });

  const outdated=publicationBlockedStatus(['outdated_running_history']);
  expect(outdated).toMatchObject({
    code:'reassessment_required',activePlan:false,
    title:'Update your current running evidence',
    message:expect.stringContaining('freshness window'),
    nextAction:{destination:'/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan'},
    recovery:{field:'longestSessionDate',actionLabel:'Update running evidence'},
  });

  for(const status of [assessment,interruption,outdated]){
    expect(`${status.title} ${status.message}`.toLowerCase()).not.toContain('norwegian');
    expect(status.message.toLowerCase()).not.toContain('performance');
  }
});

test('keeps health hold copy authoritative when a mapped missing field is also present',()=>{
  for(const codes of [
    ['health_concern_reported','missing_health_concern'],
    ['health_hold','outdated_running_history'],
    ['health_concern_reported','missing_weekly_running_minutes','interruption_requires_review'],
  ]){
    const status=publicationBlockedStatus(codes);
    expect(status).toMatchObject({
      code:'health_review_required',activePlan:false,
      title:'Health review required',
      message:'A reported concern requires review before training can proceed.',
      nextAction:{destination:'/onboarding/running?part=running-interruption&returnTo=/plan'},
    });
    expect(status.recovery).toBeUndefined();
  }
});

test('keeps missing evidence on its existing exact field recovery',()=>{
  expect(publicationBlockedStatus(['missing_weekly_running_minutes'])).toMatchObject({
    code:'more_information_needed',activePlan:false,
    title:'Add the information still needed',
    message:expect.stringContaining('weekly running minutes'),
    nextAction:{destination:'/onboarding/running?part=running-history&focus=weekly-running&returnTo=/plan'},
    recovery:{field:'weeklyMinutes',destination:'/onboarding/running?part=running-history&focus=weekly-running&returnTo=/plan'},
  });
  expect(publicationBlockedStatus(['missing_first_5k_experience'])).toMatchObject({
    code:'more_information_needed',
    nextAction:{destination:'/onboarding/running?part=first5-check&focus=first-5k-experience&returnTo=/plan'},
    recovery:{field:'first5kExperience'},
  });
  expect(publicationBlockedStatus(['invalid_or_missing_longestSessionDate'])).toMatchObject({
    code:'more_information_needed',
    nextAction:{destination:'/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan'},
    recovery:{field:'longestSessionDate'},
  });
});

test('switch while fetching authorization exposes neither old account preview nor plan',async()=>{
  (globalThis.fetch as jest.Mock).mockImplementationOnce(async(_url,options)=>{account='owner-b';return {ok:true,json:async()=>f.signTrust({...f.payload,requestNonce:JSON.parse(options.body).nonce})};});
  const result=await publishCurrentBeginner5kWeekOne();
  expect(result).toMatchObject({status:{code:'publication_conflict'},canPublish:false});expect(result.preview).toBeUndefined();
  expect(db.table('plans')).toHaveLength(0);
});
test('logout during writes aborts the transaction; later sign-in can retry',async()=>{
  const original=db.run.bind(db);
  db.run=async(sql,params)=>{const result=await original(sql,params);if(sql.startsWith('INSERT INTO audit_events'))account=null;return result;};
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('publication_conflict');
  expect(db.table('plans')).toHaveLength(0);expect(db.table('session_assignments')).toHaveLength(0);
  db.run=original;account='owner-a';
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('plan_ready');
});
test('failed SQLite publication rolls back and exposes a retryable persistence error',async()=>{
  db.failOn='INSERT INTO session_assignments';
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('plan_persistence_failure');
  expect(db.table('plans')).toHaveLength(0);db.failOn=null;
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('plan_ready');
});
test('edited local draft invalidates request before publication',async()=>{
  await new FitnessAssessmentRepository(db,'owner-a').saveDraft({...releaseTestDraft,weeklyMinutes:'60'});
  expect((await publishCurrentBeginner5kWeekOne()).status.code).toBe('publication_conflict');
  expect(db.table('plans')).toHaveLength(0);
});

test('an existing matching authorized week is returned without another publication',async()=>{
  const saved=await publishCurrentBeginner5kWeekOne();
  (loadCurrentAccountPlanFacts as jest.Mock).mockResolvedValue({ownerId:'owner-a',draft:releaseTestDraft,assessment:f.assessment,activeSnapshot:saved.snapshot});
  expect(await getCurrentBeginner5kPublicationStatus()).toMatchObject({status:{code:'plan_ready'},canPublish:false,snapshot:saved.snapshot});
  expect(db.table('session_assignments')).toHaveLength(3);
});

test('missing health answers and internal trust problems are not reported as a runner health hold',()=>{
  expect(publicationBlockedStatus(['no_explicit_pathway_for_experience']).code).toBe('program_not_supported');
  expect(publicationBlockedStatus(['no_explicit_pathway_for_experience','missing_first_5k_experience'])).toMatchObject({code:'more_information_needed',recovery:{field:'first5kExperience'}});
  expect(publicationBlockedStatus(['missing_health_concern'])).toMatchObject({code:'more_information_needed',recovery:{field:'healthConcern'}});
  expect(publicationBlockedStatus(['missing_trust_metadata'])).toMatchObject({code:'production_authorization_failure',nextAction:{destination:'/plan'}});
  expect(publicationBlockedStatus(['availability_policy_unavailable'])).toMatchObject({code:'production_authorization_failure',nextAction:{destination:'/plan'}});
  expect(publicationBlockedStatus(['mandatory_dependency_approval_missing_or_ambiguous'],'policy_approval_pending')).toMatchObject({code:'policy_approval_pending',nextAction:{destination:'/plan'}});
});
