// Deploy separately with `supabase functions deploy delete-account`.
// The Supabase runtime supplies SUPABASE_SERVICE_ROLE_KEY; it is never shipped
// in the mobile app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  const auth = request.headers.get('Authorization');
  if (!auth) return new Response('Authentication required', { status: 401, headers: cors });
  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return new Response('Authentication required', { status: 401, headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return new Response('Account deletion failed', { status: 500, headers: cors });
  return new Response(null, { status: 204, headers: cors });
});
