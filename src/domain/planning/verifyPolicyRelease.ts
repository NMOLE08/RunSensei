import { policyReleaseTrust } from './policyReleaseTrust';
import { beginner5kPublicationArtifact } from './beginner5kPublicationArtifacts';
import { releaseSha256, verifyReleaseSignature } from '@/services/security/releaseCrypto';
import { readVerifiedReleaseTrust, type VerifiedReleaseTrust } from '@/services/security/releaseTrust';
import type { PolicyReleaseTrust } from './policyReleaseTrust';

export type SignedPolicyApproval = Readonly<{ keyId: string; payload: string; signatureHex: string }>;
export type ReleaseApprovalPayload = {
  schema: 'torto-policy-release-v1'; reference: string; sha256: string; artifactId: string;
  reviewer: string; scope: 'initial_week_publication' | 'workload_compatibility';
  approvedAt: string; notBefore: string; expiresAt: string;
  applicationId: 'com.aisensei.app'; channel: 'production';
};
export type VerifiedPolicyRelease = Readonly<{ references: readonly string[]; digestIdentity: string; expiresAt: string; artifactIds: readonly string[] }>;
const verified = new WeakMap<object, { approvals: readonly (ReleaseApprovalPayload & { keyId: string })[]; trust: PolicyReleaseTrust }>();
export async function policySha256(content: string): Promise<string> {
  return releaseSha256(content);
}

/** No caller-supplied keys, digests, reviewer allowlists or artifact resolvers. */
export async function verifyPolicyRelease(envelopes: readonly SignedPolicyApproval[], required: readonly string[], evaluationTime: string, context?: VerifiedReleaseTrust) {
  const fail = (code: string) => ({ kind: 'blocked' as const, code });
  const now = Date.parse(evaluationTime);
  if (!Number.isFinite(now)) return fail('invalid_release_evaluation_time');
  const trust=context?readVerifiedReleaseTrust(context,evaluationTime):policyReleaseTrust;
  if (!trust?.validUntil || !Number.isFinite(Date.parse(trust.validUntil)) || Date.parse(trust.validUntil) <= now || !trust.keys.length) return fail('release_trust_not_configured_or_expired');
  try {
    const approvals: (ReleaseApprovalPayload & { keyId: string })[] = [];
    for (const envelope of envelopes) {
      const matches = trust.keys.filter(k => k.id === envelope.keyId && !k.revoked);
      if (matches.length !== 1) return fail('approval_signer_untrusted');
      const key = matches[0]!;
      if (!await verifyReleaseSignature(key.spkiHex,envelope.payload,envelope.signatureHex)) return fail('approval_signature_invalid');
      const p = JSON.parse(envelope.payload) as ReleaseApprovalPayload;
      if (p.schema !== 'torto-policy-release-v1' || p.applicationId !== 'com.aisensei.app' || p.channel !== 'production' || !p.artifactId || p.reviewer !== key.reviewer || !key.scopes.includes(p.scope) || !key.references.includes(p.reference)) return fail('approval_scope_or_reviewer_invalid');
      const dates = [p.approvedAt,p.notBefore,p.expiresAt].map(Date.parse);
      if (dates.some(d => !Number.isFinite(d)) || dates[0]! > now || dates[1]! > now || dates[2]! <= now || dates[2]! <= dates[1]!) return fail('approval_date_invalid_or_expired');
      if (trust.revokedArtifactIds.includes(p.artifactId)) return fail('approval_revoked');
      const content = beginner5kPublicationArtifact(p.reference);
      if (content === null || await policySha256(content) !== p.sha256) return fail('policy_content_digest_mismatch');
      approvals.push(Object.freeze({ ...p, keyId: key.id }));
    }
    for (const reference of required) {
      const scope = reference.includes('compatibility') ? 'workload_compatibility' : 'initial_week_publication';
      if (approvals.filter(a => a.reference === reference && a.scope === scope).length !== 1) return fail('mandatory_dependency_approval_missing_or_ambiguous');
    }
    const identity = approvals.filter(a => required.includes(a.reference)).map(a => `${a.reference}:${a.sha256}`).sort();
    const release: VerifiedPolicyRelease = Object.freeze({ references: Object.freeze([...required].sort()), digestIdentity: await policySha256(JSON.stringify(identity)), artifactIds: Object.freeze(approvals.map(a => a.artifactId).sort()), expiresAt: new Date(Math.min(Date.parse(trust.validUntil), ...approvals.map(a => Date.parse(a.expiresAt)))).toISOString() });
    verified.set(release, {approvals:Object.freeze(approvals),trust});
    return { kind: 'verified' as const, release };
  } catch(error) { return fail(error instanceof Error&&error.message==='cryptographic_verifier_unavailable'?'cryptographic_verifier_unavailable':'approval_verification_failed'); }
}

/** Object copies/JSON labels cannot manufacture this process-local capability. */
export function isVerifiedPolicyRelease(value: VerifiedPolicyRelease | undefined, required: readonly string[], now: string): value is VerifiedPolicyRelease {
  if (!value || !verified.has(value) || !Number.isFinite(Date.parse(now)) || Date.parse(now) >= Date.parse(value.expiresAt)) return false;
  const {approvals,trust} = verified.get(value)!;
  return required.every(r => value.references.includes(r)) && approvals.every(a => !trust.revokedArtifactIds.includes(a.artifactId) && trust.keys.some(k => k.id === a.keyId && !k.revoked && k.reviewer === a.reviewer && k.scopes.includes(a.scope) && k.references.includes(a.reference)));
}
