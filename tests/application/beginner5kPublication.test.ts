import { generateKeyPairSync, sign, constants, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { createExperimental5kPreview } from '@/domain/research/experimental5kPreview';
import { requiredBeginner5kPublicationReferences, resolveBeginner5kPublicationPolicy } from '@/domain/planning/beginner5kPublicationPolicy';
import { beginner5kPublicationArtifact, publicationCompatibilityReference } from '@/domain/planning/beginner5kPublicationArtifacts';
import { policySha256, verifyPolicyRelease, type SignedPolicyApproval, type ReleaseApprovalPayload } from '@/domain/planning/verifyPolicyRelease';
import { policyReleaseTrust } from '@/domain/planning/policyReleaseTrust';
import { publishBeginner5kInitialWeek, nextBeginner5kPublicationStatus } from '@/application/beginner5kPublication';
import { TrainingRepository } from '@/data/repositories';
import { MemoryDatabase } from '../support/memoryDatabase';
import * as artifacts from '@/domain/planning/beginner5kPublicationArtifacts';

jest.mock('@/domain/planning/policyReleaseTrust', () => ({ policyReleaseTrust: { keys: [], revokedArtifactIds: [], validUntil: null } }));
const now = '2026-11-02T12:00:00.000Z';
const draft = { ...emptyFitnessAssessmentDraft('owner-a','UTC'), adultAgeConfirmed:true,canWalk30MinutesComfortably:true,first5kExperience:'none_or_limited' as const,interruption:'none' as const,planStartDate:'2026-11-02',trainingDays:[0,3,5],weeklyMinutes:'50',longestSessionMinutes:'25',longestSessionDate:'2026-11-01',comfortableRunMinutes:'20',weeklyEvidenceConfirmedAt:'2026-11-01',currentCapabilityConfirmedAt:'2026-11-01' };
const input = { ownerId:'owner-a',draft,assessment:assessFitness(draft,now),nowDate:'2026-11-02' };
const preview = createExperimental5kPreview(input);
if (preview.kind !== 'preview') throw new Error(JSON.stringify(preview));
const references = requiredBeginner5kPublicationReferences(preview);
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const trust = policyReleaseTrust as any;
let approvals: SignedPolicyApproval[];
function signed(p: ReleaseApprovalPayload): SignedPolicyApproval {
  const payload = JSON.stringify(p);
  return { keyId:'synthetic-key', payload, signatureHex:sign('sha256', Buffer.from(payload), {key: keys.privateKey, padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('hex') };
}
const request = {profile:{id:'profile-a',units:'metric' as const,trainingTimezone:'UTC',baselineJson:'{}',version:1,createdAt:now,updatedAt:now},goal:{id:'goal-a',profileId:'profile-a',mode:'flexible' as const,distanceMeters:5000,raceDate:null,startDate:'2026-11-02' as const,version:1,createdAt:now},availability:{id:'availability-a',profileId:'profile-a',weekdayLimitsJson:'{}',preferredLongRunDay:null,exceptionsJson:'[]',version:1}};
const context={now:()=>now,id:(prefix:string)=>`${prefix}:test`};
beforeAll(async()=>{
  Object.defineProperty(globalThis,'crypto',{value:webcrypto, configurable:true});
  Object.defineProperty(globalThis,'TextEncoder',{value:TextEncoder, configurable:true});
  approvals=await Promise.all(references.map(async reference=>signed({schema:'torto-policy-release-v1',reference,sha256:await policySha256(beginner5kPublicationArtifact(reference)!),artifactId:`TEST ONLY:${reference}`,reviewer:'synthetic-reviewer',scope:reference.includes('compatibility')?'workload_compatibility':'initial_week_publication',approvedAt:'2026-11-01T00:00:00Z',notBefore:'2026-11-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z',applicationId:'com.aisensei.app',channel:'production'})));
});
beforeEach(()=>{
  trust.keys=[{id:'synthetic-key',spkiHex:keys.publicKey.export({format:'der',type:'spki'}).toString('hex'),reviewer:'synthetic-reviewer',scopes:['initial_week_publication','workload_compatibility'],references,revoked:false}];
  trust.validUntil='2026-12-01T00:00:00Z';trust.revokedArtifactIds=[];
});
test('missing real trust fails closed before any write',async()=>{
  trust.keys=[];trust.validUntil=null;
  const db=new MemoryDatabase();
  expect(await publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-a'),input,request,context,approvals)).toMatchObject({kind:'policy_approval_pending',blockers:[{code:'release_trust_not_configured_or_expired'}]});
  expect(db.table('plans')).toHaveLength(0);
});
test('signed dependency graph verifies; labels alone cannot authorize',async()=>{
  const verified=await verifyPolicyRelease(approvals,references,now);
  expect(verified.kind).toBe('verified');
  if(verified.kind!=='verified')throw new Error(verified.code);
  expect(resolveBeginner5kPublicationPolicy(preview,verified.release,now).kind).toBe('authorized');
  expect(resolveBeginner5kPublicationPolicy(preview,{...verified.release},now).kind).toBe('blocked');
});
test.each([
  ['content', {sha256:'0'.repeat(64)}, 'policy_content_digest_mismatch'],
  ['version',{reference:'wrong@version'},'approval_scope_or_reviewer_invalid'],
  ['reviewer',{reviewer:''},'approval_scope_or_reviewer_invalid'],
  ['scope',{scope:'anything'},'approval_scope_or_reviewer_invalid'],
  ['future date',{approvedAt:'2030-01-01T00:00:00Z'},'approval_date_invalid_or_expired'],
  ['expiry',{expiresAt:'2026-10-01T00:00:00Z'},'approval_date_invalid_or_expired'],
] as const)('rejects signed but invalid %s',async(_name,change,code)=>{
  const altered=signed({...JSON.parse(approvals[0]!.payload),...change});
  expect(await verifyPolicyRelease([altered,...approvals.slice(1)],references,now)).toMatchObject({kind:'blocked',code});
});
test('manifest tampering fails cryptographic verification',async()=>{
  expect(await verifyPolicyRelease([{...approvals[0]!,payload:approvals[0]!.payload+' '},...approvals.slice(1)],references,now)).toMatchObject({code:'approval_signature_invalid'});
});
test('changed bundled content fails the digest even with an intact signature',async()=>{
  const original=artifacts.beginner5kPublicationArtifact;
  const spy=jest.spyOn(artifacts,'beginner5kPublicationArtifact').mockImplementation(ref=> original(ref)+' ');
  try { expect(await verifyPolicyRelease(approvals,references,now)).toMatchObject({code:'policy_content_digest_mismatch'}); }
  finally { spy.mockRestore(); }
});
test('shipped trust has no test reviewer keys and unsupported crypto fails closed',async()=>{
  expect(jest.requireActual('@/domain/planning/policyReleaseTrust').policyReleaseTrust.keys).toEqual([]);
  Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});
  try { expect(await verifyPolicyRelease(approvals,references,now)).toMatchObject({code:'cryptographic_verifier_unavailable'}); }
  finally { Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true}); }
});
test('revoked reviewer cannot sign releases and an expired capability cannot authorize',async()=>{
  const verified=await verifyPolicyRelease(approvals,references,now);
  if(verified.kind!=='verified')throw new Error('Expected verified');
  expect(resolveBeginner5kPublicationPolicy(preview,verified.release,'2027-01-01T00:00:00Z').kind).toBe('blocked');
  trust.keys[0].revoked=true;
  expect(await verifyPolicyRelease(approvals,references,now)).toMatchObject({code:'approval_signer_untrusted'});
  expect(resolveBeginner5kPublicationPolicy(preview,verified.release,now).kind).toBe('blocked');
});
test('revocation, missing dependency and unapproved compatibility block publication',async()=>{
  trust.revokedArtifactIds=[JSON.parse(approvals[0]!.payload).artifactId];
  expect(await verifyPolicyRelease(approvals,references,now)).toMatchObject({code:'approval_revoked'});
  trust.revokedArtifactIds=[];
  const missing=approvals.filter(a=>JSON.parse(a.payload).reference!==publicationCompatibilityReference);
  const db=new MemoryDatabase();
  expect(await publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-a'),input,request,context,missing)).toMatchObject({kind:'policy_approval_pending'});
  expect(db.table('plans')).toHaveLength(0);
});
test('concurrent signed publication creates one week, preserves original steps and reloads',async()=>{
  const db=new MemoryDatabase();
  const results=await Promise.all([1,2].map(()=>publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-a'),input,request,context,approvals)));
  expect(results.map(r=>r.kind==='published'?r.applied:r)).toEqual(expect.arrayContaining([true,false]));
  const first=results.find(r=>r.kind==='published');if(!first||first.kind!=='published')throw new Error(JSON.stringify(results));
  expect(preview.sessions).toHaveLength(36);
  expect(first.snapshot.assignments.map(a=>a.plannedDate)).toEqual(preview.sessions.slice(0,3).map(s=>s.date));
  const steps=JSON.parse(first.snapshot.assignments[0]!.prescriptionJson).steps;
  expect(steps.slice(1,5).map((s:any)=>s.label)).toEqual(['work','recovery','work','recovery']);
  expect(steps.reduce((sum:number,s:any)=>sum+(s.durationSeconds??0),0)).toBe(preview.sessions[0]!.durationSeconds);
  expect(db.table('session_assignments')).toHaveLength(3);expect(db.table('plan_revisions')).toHaveLength(1);
  expect(await new TrainingRepository(db,'owner-b').getPlanSnapshot(first.snapshot.plan.id)).toBeNull();
  expect(await publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-a'),input,request,{...context,now:()=> '2026-11-02T13:00:00Z'},approvals)).toMatchObject({kind:'published',applied:false});
  expect(nextBeginner5kPublicationStatus().kind).toBe('reassessment_required');
});
test('missing current confirmation blocks despite signed numerical policy',async()=>{
  const changed={...draft,weeklyEvidenceConfirmedAt:''};
  expect(await publishBeginner5kInitialWeek(new TrainingRepository(new MemoryDatabase(),'owner-a'),{...input,draft:changed,assessment:assessFitness(changed,now)},request,context,approvals)).toMatchObject({kind:'compatibility_blocked',reasonCodes:['invalid_or_missing_weeklyEvidenceConfirmedAt']});
});
test('changed evidence rejects stale retry; account mismatch never writes',async()=>{
  const db=new MemoryDatabase();const repo=new TrainingRepository(db,'owner-a');
  await publishBeginner5kInitialWeek(repo,input,request,context,approvals);
  const changed={...draft,weeklyMinutes:'55'};
  expect(await publishBeginner5kInitialWeek(repo,{...input,draft:changed,assessment:assessFitness(changed,now)},request,context,approvals)).toMatchObject({kind:'blocked',reasonCodes:['publication_revision_conflict']});
  expect(await publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-b'),input,request,context,approvals)).toMatchObject({kind:'publication_error',reasonCodes:['publication_account_mismatch']});
  expect(db.table('session_assignments')).toHaveLength(3);
});
test.each([
  {healthConcern:true}, {interruption:'health_related' as const}, {interruption:'over_four_weeks' as const},
  {adultAgeConfirmed:false}, {canWalk30MinutesComfortably:false}, {trainingDays:[0,1,2]},
  {first5kExperience:'substantial' as const,weeklyMinutes:'10',comfortableRunMinutes:'5',longestSessionMinutes:'5'},
])('approved release never overrides runner entry or schedule failures: %j',async change=>{
  const changed={...draft,...change};const db=new MemoryDatabase();
  const result=await publishBeginner5kInitialWeek(new TrainingRepository(db,'owner-a'),{...input,draft:changed,assessment:assessFitness(changed,now)},request,context,approvals);
  expect(result.kind).not.toBe('published');expect(db.table('plans')).toHaveLength(0);
});
