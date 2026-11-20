import { constants, generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { createExperimental5kPreview } from '@/domain/research/experimental5kPreview';
import { requiredBeginner5kPublicationReferences } from '@/domain/planning/beginner5kPublicationPolicy';
import { beginner5kPublicationArtifact } from '@/domain/planning/beginner5kPublicationArtifacts';
import { policySha256 } from '@/domain/planning/verifyPolicyRelease';
import type { ReleaseTrustPayload } from '@/services/security/releaseTrust';

export const releaseTestTime='2026-11-02T12:00:00.000Z';
export const releaseTestDraft={...emptyFitnessAssessmentDraft('owner-a','UTC'),adultAgeConfirmed:true,canWalk30MinutesComfortably:true,first5kExperience:'none_or_limited' as const,interruption:'none' as const,planStartDate:'2026-11-02',trainingDays:[0,3,5],weeklyMinutes:'50',comfortableRunMinutes:'20',longestSessionMinutes:'25',longestSessionDate:'2026-11-01',weeklyEvidenceConfirmedAt:'2026-11-01',currentCapabilityConfirmedAt:'2026-11-01'};
export function installTestWebCrypto(){Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});Object.defineProperty(globalThis,'TextEncoder',{value:TextEncoder,configurable:true});}
/** Test files only. No private/public fixture keys are written to production assets. */
export async function signedReleaseFixture(){
  installTestWebCrypto();
  const root=generateKeyPairSync('rsa',{modulusLength:2048});const reviewer=generateKeyPairSync('rsa',{modulusLength:2048});
  const signPayload=(key:typeof root.privateKey,keyId:string,p:unknown)=>{const payload=JSON.stringify(p);return{keyId,payload,signatureHex:sign('sha256',Buffer.from(payload),{key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('hex')};};
  const assessment=assessFitness(releaseTestDraft,releaseTestTime);
  const preview=createExperimental5kPreview({ownerId:'owner-a',draft:releaseTestDraft,assessment,nowDate:'2026-11-02'});
  if(preview.kind!=='preview')throw new Error('fixture not eligible');
  const references=requiredBeginner5kPublicationReferences(preview);
  const approvals=await Promise.all(references.map(async reference=>signPayload(reviewer.privateKey,'test-reviewer',{schema:'torto-policy-release-v1',reference,sha256:await policySha256(beginner5kPublicationArtifact(reference)!),artifactId:`test-only:${reference}`,reviewer:'TEST ONLY',scope:reference.includes('compatibility')?'workload_compatibility':'initial_week_publication',approvedAt:'2026-11-01T00:00:00Z',notBefore:'2026-11-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z',applicationId:'com.aisensei.app',channel:'production'})));
  const payload:ReleaseTrustPayload={schema:'torto-release-trust-v1',version:1,issuedAt:releaseTestTime,expiresAt:'2026-11-02T12:05:00Z',requestNonce:'test-nonce',keys:[{id:'test-reviewer',version:1,spkiHex:reviewer.publicKey.export({format:'der',type:'spki'}).toString('hex'),reviewer:'TEST ONLY',scopes:['workload_compatibility','initial_week_publication'],references,revoked:false}],revokedArtifactIds:[],approvals};
  return {preview,assessment,payload,references,root:{id:'test-root',version:1,spkiHex:root.publicKey.export({format:'der',type:'spki'}).toString('hex'),revoked:false},signTrust:(p:ReleaseTrustPayload)=>signPayload(root.privateKey,'test-root',p)};
}
