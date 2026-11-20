import { supabase } from '@/services/auth/supabase';

/** Listener is independent of mounted screens. A switch away and back still cancels. */
export async function acquirePublicationAccount() {
  let owner:string|null=null;let observed:string|null|undefined;let cancelled=false;let expiresAt=0;
  const listener=supabase.auth.onAuthStateChange((_event,session)=>{
    observed=session?.user.id??null;
    if(owner&&observed!==owner) cancelled=true;
  });
  try {
    const {data,error}=await supabase.auth.getSession();
    owner=data.session?.user.id??null;expiresAt=(data.session?.expires_at??0)*1000;
    if(error||!owner||expiresAt<=Date.now()||(observed!==undefined&&observed!==owner)) throw new Error('publication_account_changed');
    return {
      ownerId:owner,
      assertCurrent:async()=>{if(cancelled||Date.now()>=expiresAt)throw new Error('publication_account_changed');},
      dispose:()=>listener.data.subscription.unsubscribe(),
    };
  } catch(error) {listener.data.subscription.unsubscribe();throw error;}
}
