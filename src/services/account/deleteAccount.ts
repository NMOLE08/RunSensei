import { supabase } from '@/services/auth/supabase';

/** Server-authorized deletion. Requires the separately deployed delete-account Edge Function. */
export async function requestAccountDeletion(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
}
