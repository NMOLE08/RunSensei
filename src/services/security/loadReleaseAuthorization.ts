import * as SecureStore from 'expo-secure-store';
import { policyAuthorizationConfig, authorizationRequestTimeoutMs } from '@/config/policyAuthorization';
import { releaseNonce, releaseSha256 } from './releaseCrypto';
import { verifyReleaseTrust, readVerifiedReleaseTrust, type VerifiedReleaseTrust } from './releaseTrust';

let updateQueue: Promise<unknown> = Promise.resolve();
export async function assertReleaseAuthorizationCurrent(context: VerifiedReleaseTrust) {
  if(!readVerifiedReleaseTrust(context,new Date().toISOString()))throw new Error('publication_authorization_expired');
  const raw=await SecureStore.getItemAsync('torto.release.trust.version');
  const stored=raw===null?null:JSON.parse(raw);
  if(!stored||stored.version!==context.version)throw new Error('publication_authorization_expired');
}
/** New publication is online-only. Reading saved workouts never calls this service. */
export async function loadReleaseAuthorization() {
  const endpoint=policyAuthorizationConfig.endpoint;
  if(!endpoint || !policyAuthorizationConfig.roots.length) return {kind:'blocked' as const,code:'release_trust_not_configured'};
  if(!endpoint.startsWith('https://')) return {kind:'blocked' as const,code:'authorization_endpoint_invalid'};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),authorizationRequestTimeoutMs);
  try {
    const nonce=await releaseNonce();
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schema:'torto-authorization-request-v1',nonce,applicationId:'com.aisensei.app'}),signal:controller.signal,cache:'no-store'});
    if(!response.ok) return {kind:'blocked' as const,code:'authorization_service_unavailable'};
    const envelope=await response.json();
    const pending=updateQueue.catch(()=>undefined).then(async()=>{
      const raw=await SecureStore.getItemAsync('torto.release.trust.version');
      const stored=raw===null?{version:0,digest:null}:JSON.parse(raw);
      const minimum=typeof stored==='number'?stored:stored.version;
      if(!Number.isSafeInteger(minimum)||minimum<0) return {kind:'blocked' as const,code:'trust_version_storage_invalid'};
      const result=await verifyReleaseTrust(envelope,nonce,new Date().toISOString(),minimum);
      if(result.kind==='verified') {
        const signed=JSON.parse(envelope.payload);
        const digest=await releaseSha256(JSON.stringify({keys:signed.keys,revokedArtifactIds:signed.revokedArtifactIds}));
        if(typeof stored==='object'&&stored.digest&&minimum===result.context.version&&stored.digest!==digest)return {kind:'blocked' as const,code:'trust_version_content_conflict'};
        const keyHistory:Record<string,{version:number;digest:string;revoked:boolean}>={...(typeof stored==='object'?stored.keyHistory??{}:{})};
        const revoked:string[]=typeof stored==='object'?stored.revokedArtifactIds??[]:[];
        if(revoked.some(id=>!signed.revokedArtifactIds.includes(id)))return {kind:'blocked' as const,code:'revocation_history_rollback'};
        for(const key of signed.keys) {
          const keyDigest=await releaseSha256(JSON.stringify({id:key.id,spkiHex:key.spkiHex,reviewer:key.reviewer,scopes:key.scopes,references:key.references}));
          const prior=keyHistory[key.id];
          if(prior&&(key.version<prior.version||key.version===prior.version&&prior.digest!==keyDigest||prior.revoked&&!key.revoked))return {kind:'blocked' as const,code:'reviewer_key_rotation_invalid'};
          keyHistory[key.id]={version:key.version,digest:keyDigest,revoked:key.revoked};
        }
        await SecureStore.setItemAsync('torto.release.trust.version',JSON.stringify({version:result.context.version,digest,keyHistory,revokedArtifactIds:signed.revokedArtifactIds}));
      }
      return result;
    });
    updateQueue=pending;
    return await pending;
  } catch(error) {
    return {kind:'blocked' as const,code:error instanceof Error&&error.message==='cryptographic_verifier_unavailable'?'cryptographic_verifier_unavailable':'fresh_authorization_unavailable'};
  } finally {clearTimeout(timeout);}
}
