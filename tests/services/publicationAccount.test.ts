import { acquirePublicationAccount } from '@/services/account/publicationAccount';
import { supabase } from '@/services/auth/supabase';
jest.mock('@/services/auth/supabase',()=>({supabase:{auth:{onAuthStateChange:jest.fn(),getSession:jest.fn()}}}));
test('live auth lease cancels after switching away and back and unsubscribes',async()=>{
  let listener:Function=()=>undefined;const unsubscribe=jest.fn();
  (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation(cb=>{listener=cb;return{data:{subscription:{unsubscribe}}};});
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({data:{session:{user:{id:'a'},expires_at:Date.now()/1000+3600}}});
  const lease=await acquirePublicationAccount();await expect(lease.assertCurrent()).resolves.toBeUndefined();
  listener('SIGNED_IN',{user:{id:'b'}});listener('SIGNED_IN',{user:{id:'a'}});
  await expect(lease.assertCurrent()).rejects.toThrow('publication_account_changed');
  lease.dispose();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
test('expired or missing session cannot acquire a publication lease',async()=>{
  const unsubscribe=jest.fn();(supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({data:{subscription:{unsubscribe}}});
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({data:{session:null}});
  await expect(acquirePublicationAccount()).rejects.toThrow('publication_account_changed');expect(unsubscribe).toHaveBeenCalled();
});
