// Deno resolves npm: specifiers when the Edge Function is bundled.
// eslint-disable-next-line import/no-unresolved
import { GoogleGenAI, ThinkingLevel } from 'npm:@google/genai@2.31.0';
// eslint-disable-next-line import/no-unresolved
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  buildWeeklyPlannerInput,
  GEMINI_MODEL,
  validateWeeklyPlan,
  WEEKLY_COACH_SYSTEM_PROMPT,
  WEEKLY_PLAN_SCHEMA,
  WEEKLY_PROMPT_VERSION,
  WeeklyPlannerError,
  type NativeRunSummary,
  type ReviewedWeeklyPolicy,
  type RunnerQuestionnaire,
  type WeeklyPlanProposal,
} from '../_shared/weeklyPlanner.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(405, { code: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(401, { code: 'authentication_required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { code: 'server_not_configured' });

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await authClient.auth.getUser();
  if (authError || !auth.user) return json(401, { code: 'invalid_session' });

  let body: { weekStartDate?: string; idempotencyKey?: string };
  try { body = await request.json(); } catch { return json(400, { code: 'invalid_json' }); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.weekStartDate ?? '')) return json(400, { code: 'invalid_week_start' });
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey ?? '')) return json(400, { code: 'invalid_idempotency_key' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: profileRow } = await admin.from('weekly_runner_profiles').select('questionnaire').eq('user_id', auth.user.id).maybeSingle();
  if (!profileRow) return json(409, { code: 'missing_profile', message: 'Complete the weekly planner questionnaire first.' });

  const { data: policyRow } = await admin.from('weekly_training_policies').select('policy').eq('status', 'reviewed').eq('active', true).maybeSingle();
  if (!policyRow) return json(409, { code: 'no_reviewed_policy', message: 'Reviewed weekly coaching content is not available yet.' });

  const { data: summaryRows, error: summaryError } = await admin.from('weekly_native_run_summaries')
    .select('summary').eq('user_id', auth.user.id).order('period_end', { ascending: false }).limit(1);
  if (summaryError) return json(503, { code: 'profile_data_unavailable' });

  let plannerInput;
  try {
    plannerInput = buildWeeklyPlannerInput(
      profileRow.questionnaire as RunnerQuestionnaire,
      ((summaryRows?.[0]?.summary as { records?: NativeRunSummary[] } | undefined)?.records ?? []),
      policyRow.policy as ReviewedWeeklyPolicy,
      body.weekStartDate!,
    );
  } catch (error) {
    if (error instanceof WeeklyPlannerError) return json(409, { code: error.code, message: error.message });
    return json(500, { code: 'input_build_failed' });
  }

  const fingerprint = await sha256(plannerInput);
  const { data: existing } = await admin.from('weekly_plans').select('id, plan, input_fingerprint, status')
    .eq('user_id', auth.user.id).eq('start_date', body.weekStartDate!).in('status', ['draft', 'accepted']).maybeSingle();
  if (existing?.input_fingerprint === fingerprint) return json(200, { planId: existing.id, plan: existing.plan, reused: true });
  if (existing) return json(409, { code: 'active_week_requires_review', message: 'This week already has a plan. Review it before creating a revision.' });

  const { error: reservationError } = await admin.from('weekly_generation_requests').insert({
    user_id: auth.user.id,
    start_date: body.weekStartDate,
    idempotency_key: body.idempotencyKey,
    input_fingerprint: fingerprint,
    status: 'running',
  });
  if (reservationError) {
    const { data: prior } = await admin.from('weekly_generation_requests').select('status, plan_id, error_code')
      .eq('user_id', auth.user.id).eq('idempotency_key', body.idempotencyKey!).maybeSingle();
    if (prior?.status === 'completed' && prior.plan_id) {
      const { data: saved } = await admin.from('weekly_plans').select('id, plan').eq('id', prior.plan_id).single();
      return json(200, { planId: saved?.id, plan: saved?.plan, reused: true });
    }
    return json(409, { code: prior?.error_code ?? 'generation_in_progress' });
  }

  const failRequest = async (code: string) => {
    await admin.from('weekly_generation_requests').update({ status: 'failed', error_code: code, completed_at: new Date().toISOString() })
      .eq('user_id', auth.user.id).eq('idempotency_key', body.idempotencyKey!);
  };

  if (!geminiKey) {
    await failRequest('gemini_not_configured');
    return json(503, { code: 'gemini_not_configured' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: JSON.stringify(plannerInput),
      config: {
        systemInstruction: WEEKLY_COACH_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: WEEKLY_PLAN_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });
    if (!response.text) throw new WeeklyPlannerError('empty_model_response', 'The planner returned no plan.');
    let proposal: WeeklyPlanProposal;
    try { proposal = JSON.parse(response.text) as WeeklyPlanProposal; }
    catch { throw new WeeklyPlannerError('invalid_model_json', 'The planner returned invalid data.'); }
    validateWeeklyPlan(proposal, plannerInput);

    const { data: planId, error: saveError } = await admin.rpc('save_generated_weekly_plan', {
      p_user_id: auth.user.id,
      p_start_date: body.weekStartDate,
      p_plan: proposal,
      p_input_fingerprint: fingerprint,
      p_policy_version: plannerInput.policy.version,
      p_prompt_version: WEEKLY_PROMPT_VERSION,
      p_model_id: GEMINI_MODEL,
      p_idempotency_key: body.idempotencyKey,
    });
    if (saveError || !planId) throw new WeeklyPlannerError('save_failed', 'The validated plan could not be saved.');
    return json(200, { planId, plan: proposal, reused: false });
  } catch (error) {
    const code = error instanceof WeeklyPlannerError ? error.code : 'generation_failed';
    await failRequest(code);
    return json(error instanceof WeeklyPlannerError ? 422 : 503, { code, message: 'No plan was saved. Please try again later.' });
  }
});
