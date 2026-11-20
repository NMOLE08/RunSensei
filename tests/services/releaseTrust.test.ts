import { policyAuthorizationConfig } from '@/config/policyAuthorization';
import { verifyReleaseTrust, readVerifiedReleaseTrust } from '@/services/security/releaseTrust';
import { verifyPolicyRelease } from '@/domain/planning/verifyPolicyRelease';
import { signedReleaseFixture,releaseTestTime } from '../support/releaseApprovalFixtures';
jest.mock('@/config/policyAuthorization',()=>({policyAuthorizationConfig:{endpoint:null,roots:[]},authorizationClockSkewMs:300000}));
let f:Awaited<ReturnType<typeof signedReleaseFixture>>;
beforeAll(async()=>{f=await signedReleaseFixture();});
beforeEach(()=>{(policyAuthorizationConfig as any).roots=[f.root];});
test('signed root enrolls reviewer and complete graph, never a supplied arbitrary key',async()=>{
  const r=await verifyReleaseTrust(f.signTrust(f.payload),'test-nonce',releaseTestTime,0);
  expect(r.kind).toBe('verified');if(r.kind!=='verified')throw new Error(r.code);
  expect((await verifyPolicyRelease(r.context.approvals,f.references,releaseTestTime,r.context)).kind).toBe('verified');
  expect(readVerifiedReleaseTrust({...r.context},releaseTestTime)).toBeNull();
  expect(readVerifiedReleaseTrust(r.context,'2026-11-02T12:06:00Z')).toBeNull();
  expect(readVerifiedReleaseTrust(r.context,'2026-11-02T11:59:59Z')).toBeNull();
  expect(jest.requireActual('@/config/policyAuthorization').policyAuthorizationConfig.roots).toEqual([]);
});
test.each([
  ['nonce',{requestNonce:'old'},'trust_replay_or_rollback'],
  ['missing revocations',{revokedArtifactIds:undefined},'revocation_or_enrollment_missing'],
  ['expired',{expiresAt:'2026-11-02T11:59:00Z'},'trust_metadata_expired_or_invalid'],
  ['stale',{issuedAt:'2026-11-01T12:00:00Z'},'authorization_clock_discrepancy'],
  ['future',{issuedAt:'2026-11-03T12:00:00Z',expiresAt:'2026-11-04T00:00:00Z'},'authorization_clock_discrepancy'],
] as const)('fails closed for %s',async(_label,change,code)=>{
  expect(await verifyReleaseTrust(f.signTrust({...f.payload,...change} as any),'test-nonce',releaseTestTime,0)).toMatchObject({kind:'blocked',code});
});
test('rollback and tampering fail, newer root-signed rotation succeeds',async()=>{
  expect(await verifyReleaseTrust(f.signTrust(f.payload),'test-nonce',releaseTestTime,2)).toMatchObject({code:'trust_replay_or_rollback'});
  const envelope=f.signTrust(f.payload);
  expect(await verifyReleaseTrust({...envelope,payload:envelope.payload+' '},'test-nonce',releaseTestTime,0)).toMatchObject({code:'trust_signature_invalid'});
  const rotated={...f.payload,version:2,keys:f.payload.keys.map(k=>({...k,version:2,id:'rotated-reviewer'}))};
  expect((await verifyReleaseTrust(f.signTrust(rotated),'test-nonce',releaseTestTime,1)).kind).toBe('verified');
  (policyAuthorizationConfig as any).roots=[];
  expect(await verifyReleaseTrust(envelope,'test-nonce',releaseTestTime,0)).toMatchObject({code:'authorization_root_untrusted'});
});
test('signed revocation of approval or key still blocks publication',async()=>{
  for(const payload of [{...f.payload,revokedArtifactIds:[JSON.parse(f.payload.approvals[0]!.payload).artifactId]},{...f.payload,keys:f.payload.keys.map(k=>({...k,revoked:true}))}]){
    const r=await verifyReleaseTrust(f.signTrust(payload),'test-nonce',releaseTestTime,0);
    if(r.kind!=='verified')throw new Error(r.code);
    expect((await verifyPolicyRelease(r.context.approvals,f.references,releaseTestTime,r.context)).kind).toBe('blocked');
  }
});
