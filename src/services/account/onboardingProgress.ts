import type { User } from '@supabase/supabase-js';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { supabase } from '@/services/auth/supabase';

export type RemoteOnboardingStatus = 'not_started' | 'in_progress' | 'completed';
export type RemoteOnboardingProgress = { status: RemoteOnboardingStatus; currentStep: string | null; schemaVersion: number; answers: Record<string, unknown> };

type ProgressRow = { status: RemoteOnboardingStatus; current_step: string | null; schema_version: number; answers: Record<string, unknown> };

const answerFields: (keyof FitnessAssessmentDraft)[] = [
  'foundationEvidenceConfirmedAt',
  'foundationFrequency', 'foundationPostBreakConfirmed',
  'weeklyDistance', 'weeklyDistanceUnit', 'weeklyMinutes', 'historyDays', 'observedWeeklyRunFrequency', 'runningConsistency', 'weeklyEvidenceConfirmedAt', 'currentCapabilityConfirmedAt', 'currentTrainingStatus', 'lastRunningDate', 'interruptionReason', 'longestSessionMinutes', 'longestSessionDate', 'longestSessionDistance', 'longestSessionDistanceUnit', 'comfortableRunMinutes', 'runningStyle', 'easyRunTalkTest', 'usualComfortableRunEffort',
  'interruption', 'interruptionNote', 'healthConcern', 'performanceDistanceMeters', 'performanceSeconds', 'performanceDate', 'performanceKind', 'performanceEffort', 'performanceQuality',
  'goal', 'goalFocus', 'trainingObjective', 'targetTimeSeconds', 'goalDate', 'goalDateFixed', 'planStartDate', 'preferredTrainingFrequency', 'trainingDays', 'minuteLimits', 'minuteLimitConfirmedDays', 'preferredLongDay', 'unavailableDates', 'units', 'timezone',
  'adultAgeConfirmed', 'canWalk30MinutesComfortably', 'first5kExperience',
  'coachId', 'coachIntroAcknowledged',
];

export const onboardingAnswers = (draft: FitnessAssessmentDraft): Record<string, unknown> => Object.fromEntries(answerFields.map((field) => [field, draft[field]]));
const map = (row: ProgressRow): RemoteOnboardingProgress => ({ status: row.status, currentStep: row.current_step, schemaVersion: row.schema_version, answers: row.answers ?? {} });

export async function bootstrapAccount(user: User): Promise<RemoteOnboardingProgress> {
  const { error: ensureError } = await supabase.rpc('ensure_own_profile');
  if (ensureError) throw ensureError;
  const { data, error } = await supabase.from('onboarding_progress').select('status,current_step,schema_version,answers').eq('user_id', user.id).single();
  if (error) throw error;
  return map(data as ProgressRow);
}

export async function saveRemoteOnboardingProgress(currentStep: string, draft: FitnessAssessmentDraft): Promise<RemoteOnboardingProgress> {
  const { data, error } = await supabase.rpc('save_own_onboarding_progress', { p_current_step: currentStep, p_schema_version: draft.schemaVersion, p_answers: onboardingAnswers(draft) });
  if (error) throw error;
  return map(data as ProgressRow);
}

/** Loads only the authenticated account's saved answers through RLS. */
export async function loadRemoteOnboardingAnswers(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('onboarding_progress').select('answers').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.answers && typeof data.answers === 'object' ? data.answers as Record<string, unknown> : null;
}

export async function completeRemoteOnboarding(draft: FitnessAssessmentDraft): Promise<RemoteOnboardingProgress> {
  if (draft.coachId !== 'moss' && draft.coachId !== 'jett') throw new Error('coach_selection_required');
  if (!draft.coachIntroAcknowledged) throw new Error('coach_introduction_required');
  const { data, error } = await supabase.rpc('complete_own_onboarding', { p_schema_version: draft.schemaVersion, p_answers: onboardingAnswers(draft) });
  if (error) throw error;
  return map(data as ProgressRow);
}

export async function updateRemoteDisplayName(displayName: string): Promise<void> {
  const { error } = await supabase.rpc('update_own_profile', { p_display_name: displayName });
  if (error) throw error;
}
