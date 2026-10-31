import { weeklyAiPlannerEnabled } from '@/config/productMode';
import { supabase } from '@/services/auth/supabase';

export interface GeneratedWeekResponse {
  planId: string;
  plan: unknown;
  reused: boolean;
}

export async function generateWeeklyPlan(weekStartDate: string, idempotencyKey: string): Promise<GeneratedWeekResponse> {
  if (!weeklyAiPlannerEnabled) throw new Error('The weekly planner is not enabled in this build.');
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Sign in before creating a cloud weekly plan.');
  const { data, error } = await supabase.functions.invoke<GeneratedWeekResponse>('generate-week', {
    body: { weekStartDate, idempotencyKey },
  });
  if (error) throw new Error(error.message || 'The weekly plan could not be created.');
  if (!data?.planId) throw new Error('The weekly planner returned an incomplete response.');
  return data;
}
