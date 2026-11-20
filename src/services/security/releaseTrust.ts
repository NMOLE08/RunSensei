import { policyAuthorizationConfig, authorizationClockSkewMs } from '@/config/policyAuthorization';
import { verifyReleaseSignature } from './releaseCrypto';
import type { PolicyReleaseTrust } from '@/domain/planning/policyReleaseTrust';
import type { SignedPolicyApproval } from '@/domain/planning/verifyPolicyRelease';

export type ReleaseTrustPayload = {
  schema: 'torto-release-trust-v1'; version: number; issuedAt: string; expiresAt: string; requestNonce: string;
  keys: (PolicyReleaseTrust['keys'][number] & { version: number })[];
  revokedArtifactIds: string[];
  approvals: SignedPolicyApproval[];
};
export type VerifiedReleaseTrust = Readonly<{ version: number; expiresAt: string; approvals: readonly SignedPolicyApproval[] }>;
const contexts = new WeakMap<object, { trust: PolicyReleaseTrust; verifiedAt: number }>();
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s=>typeof s==='string'&&s.length>0);

export async function verifyReleaseTrust(envelope: { keyId: string; payload: string; signatureHex: string }, nonce: string, now: string, minimumVersion: number) {
  const fail=(code:string)=>({kind:'blocked' as const,code});
  try {
    const matches=policyAuthorizationConfig.roots.filter(r=>r.id===envelope.keyId&&!r.revoked);
    if(matches.length!==1) return fail('authorization_root_untrusted');
    if(!await verifyReleaseSignature(matches[0]!.spkiHex,envelope.payload,envelope.signatureHex)) return fail('trust_signature_invalid');
    const p=JSON.parse(envelope.payload) as ReleaseTrustPayload;
    if(p.schema!=='torto-release-trust-v1'||p.requestNonce!==nonce||!nonce||!Number.isSafeInteger(p.version)||p.version<1||p.version<minimumVersion) return fail('trust_replay_or_rollback');
    const time=Date.parse(now),issued=Date.parse(p.issuedAt),expiry=Date.parse(p.expiresAt);
    if(![time,issued,expiry].every(Number.isFinite)||expiry<=time||expiry<=issued) return fail('trust_metadata_expired_or_invalid');
    if(Math.abs(time-issued)>authorizationClockSkewMs) return fail('authorization_clock_discrepancy');
    if(!Array.isArray(p.keys)||p.keys.length===0||!strings(p.revokedArtifactIds)||!Array.isArray(p.approvals)) return fail('revocation_or_enrollment_missing');
    if(new Set(p.keys.map(k=>k.id)).size!==p.keys.length) return fail('duplicate_reviewer_key');
    for(const k of p.keys) {
      if(typeof k.id!=='string'||!k.id||['__proto__','constructor','prototype'].includes(k.id)||typeof k.reviewer!=='string'||!k.reviewer.trim()||!Number.isSafeInteger(k.version)||k.version<1||typeof k.revoked!=='boolean'||typeof k.spkiHex!=='string'||!strings(k.scopes)||!strings(k.references)||!k.scopes.length||!k.references.length||k.scopes.some(s=>s!=='workload_compatibility'&&s!=='initial_week_publication')) return fail('invalid_reviewer_enrollment');
    }
    if(p.approvals.some(a=>!a||typeof a.keyId!=='string'||typeof a.payload!=='string'||typeof a.signatureHex!=='string')) return fail('invalid_approval_envelope');
    const expiresAt=new Date(Math.min(expiry,issued+authorizationClockSkewMs,time+authorizationClockSkewMs)).toISOString();
    if(Date.parse(expiresAt)<=time)return fail('trust_metadata_expired_or_invalid');
    const trust:PolicyReleaseTrust=Object.freeze({keys:Object.freeze(p.keys.map(k=>Object.freeze({...k,scopes:Object.freeze([...k.scopes]),references:Object.freeze([...k.references])}))),revokedArtifactIds:Object.freeze([...p.revokedArtifactIds]),validUntil:expiresAt});
    const context:VerifiedReleaseTrust=Object.freeze({version:p.version,expiresAt,approvals:Object.freeze(p.approvals.map(a=>Object.freeze({...a})))});
    contexts.set(context,{trust,verifiedAt:time});
    return {kind:'verified' as const,context};
  } catch {return fail('trust_verification_failed');}
}
export function readVerifiedReleaseTrust(context: VerifiedReleaseTrust, now: string): PolicyReleaseTrust | null {
  const record=contexts.get(context);
  const time=Date.parse(now);
  return record&&Number.isFinite(time)&&time>=record.verifiedAt&&time<Date.parse(context.expiresAt) ? record.trust : null;
}
