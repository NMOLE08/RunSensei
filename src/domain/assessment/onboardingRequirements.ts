import type { FitnessAssessmentDraft } from './types';

export const onboardingSteps = ['running', 'performance', 'goal', 'availability', 'assessment', 'coach'] as const;
export type OnboardingStep = typeof onboardingSteps[number];

export type OnboardingRequirement =
  | 'recent_weekly_running'
  | 'weekly_running_minutes'
  | 'current_training_context'
  | 'current_capacity_confirmation'
  | 'longest_session_minutes'
  | 'longest_session_date'
  | 'comfortable_running_minutes'
  | 'recent_interruption'
  | 'adult_confirmation'
  | 'walking_comfort'
  | 'first_5k_experience'
  | 'goal'
  | 'plan_start_date'
  | 'goal_date'
  | 'training_days'
  | 'available_minutes'
  | 'available_minutes_confirmation'
  | 'coach_selection'
  | 'coach_introduction';

export type OnboardingRequirementTarget = { step: OnboardingStep; focus: string; label: string };
export type OnboardingValidationIssue = Readonly<{
  requirement: OnboardingRequirement;
  target: OnboardingRequirementTarget;
  message: string;
}>;

const targets: Record<OnboardingRequirement, OnboardingRequirementTarget> = {
  weekly_running_minutes: { step: 'running', focus: 'weekly-running', label: 'weekly running minutes (needed for the time-based half-marathon preview)' },
  current_training_context: { step: 'running', focus: 'current-training-context', label: 'current running context' },
  current_capacity_confirmation: { step: 'running', focus: 'running-evidence-confirmation', label: 'confirmation of current running capacity' },
  recent_weekly_running: { step: 'running', focus: 'weekly-running', label: 'recent weekly running' },
  longest_session_minutes: { step: 'running', focus: 'longest-session-minutes', label: 'longest recent session duration' },
  longest_session_date: { step: 'running', focus: 'longest-session-date', label: 'date of longest recent session' },
  comfortable_running_minutes: { step: 'running', focus: 'comfortable-running-minutes', label: 'comfortable continuous running duration' },
  recent_interruption: { step: 'running', focus: 'recent-interruption', label: 'recent interruption' },
  adult_confirmation: { step: 'running', focus: 'adult-confirmation', label: 'adult confirmation' },
  walking_comfort: { step: 'running', focus: 'walking-comfort', label: 'walking comfort' },
  first_5k_experience: { step: 'running', focus: 'first-5k-experience', label: 'first-5K experience' },
  goal: { step: 'goal', focus: 'goal', label: 'goal' },
  plan_start_date: { step: 'goal', focus: 'plan-start-date', label: 'plan start date' },
  goal_date: { step: 'goal', focus: 'goal-date', label: 'goal date' },
  training_days: { step: 'availability', focus: 'training-days', label: 'training days' },
  available_minutes: { step: 'availability', focus: 'available-minutes', label: 'available minutes' },
  available_minutes_confirmation: { step: 'availability', focus: 'available-minutes-confirmation', label: 'confirm available minutes' },
  coach_selection: { step: 'coach', focus: 'coach-selection', label: 'preferred coach' },
  coach_introduction: { step: 'coach', focus: 'coach-introduction', label: 'coach introduction confirmation' },
};

const messages: Record<OnboardingRequirement, string> = {
  recent_weekly_running: 'Enter recent weekly running time, or add a positive weekly distance.',
  weekly_running_minutes: 'Enter your recent weekly running time for this half-marathon preparation check.',
  current_training_context: 'Choose whether you are currently training, returning after a break, or starting for the first time.',
  current_capacity_confirmation: 'Confirm that these running-capacity details are current.',
  longest_session_minutes: 'Enter the duration of your longest recent session.',
  longest_session_date: 'Select when your longest recent session took place.',
  comfortable_running_minutes: 'Enter how long you can comfortably run continuously today.',
  recent_interruption: 'Choose the answer that best describes any recent interruption.',
  adult_confirmation: 'Answer whether you are 18 or older.',
  walking_comfort: 'Answer whether you can comfortably walk for 30 minutes.',
  first_5k_experience: 'Choose the option that best describes your first-5K experience.',
  goal: 'Choose the goal you want to work toward.',
  plan_start_date: 'Select when you would like your plan to begin.',
  goal_date: 'Select the fixed event date, or turn off the fixed-date option.',
  training_days: 'Choose at least one day you can genuinely train.',
  available_minutes: 'Add the available time for this training day.',
  available_minutes_confirmation: 'Confirm the available time for this training day.',
  coach_selection: 'Choose Moss or Jett as your coach.',
  coach_introduction: 'Play or skip your coach introduction before continuing.',
};

const positive = (value: string | undefined) => Number.isFinite(Number(value)) && Number(value) > 0;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Fields we require before moving beyond a step. This is data-completeness only;
 * it deliberately does not decide whether a runner is eligible for coaching.
 */
export function missingOnboardingRequirements(draft: FitnessAssessmentDraft): OnboardingRequirement[] {
  const missing: OnboardingRequirement[] = [];
  if (!positive(draft.weeklyMinutes) && !positive(draft.weeklyDistance)) missing.push('recent_weekly_running');
  if (!positive(draft.longestSessionMinutes)) missing.push('longest_session_minutes');
  if (!date(draft.longestSessionDate)) missing.push('longest_session_date');
  if (!positive(draft.comfortableRunMinutes)) missing.push('comfortable_running_minutes');
  if (draft.interruption === 'unknown') missing.push('recent_interruption');
  if (draft.goal === '5k') {
    if (draft.adultAgeConfirmed === null) missing.push('adult_confirmation');
    if (draft.canWalk30MinutesComfortably === null) missing.push('walking_comfort');
    if (draft.first5kExperience === 'unknown') missing.push('first_5k_experience');
  }
  if (draft.goal === 'half_marathon') {
    if (draft.currentTrainingStatus === 'unknown') missing.push('current_training_context');
    // Returning and first-time runners must not be asked to certify historical
    // numbers as current merely to complete their profile.
    if (draft.currentTrainingStatus === 'currently_training') {
      if (!positive(draft.weeklyMinutes)) missing.push('weekly_running_minutes');
      if (!date(draft.currentCapabilityConfirmedAt) && !date(draft.foundationEvidenceConfirmedAt ?? '')) missing.push('current_capacity_confirmation');
    }
  }
  if (!draft.goal) missing.push('goal');
  if (!date(draft.planStartDate)) missing.push('plan_start_date');
  if (draft.goalDateFixed && !date(draft.goalDate)) missing.push('goal_date');
  if (!draft.trainingDays.length) missing.push('training_days');
  if (draft.coachId !== 'moss' && draft.coachId !== 'jett') missing.push('coach_selection');
  if (!draft.coachIntroAcknowledged) missing.push('coach_introduction');
  return missing;
}

/** All runner facts are complete; coach choice is intentionally the final step. */
export function isReadyForCoachSelection(draft: FitnessAssessmentDraft): boolean {
  return missingOnboardingRequirements(draft).every((requirement) => requirement === 'coach_selection' || requirement === 'coach_introduction');
}

export function missingRequirementsForStep(draft: FitnessAssessmentDraft, step: OnboardingStep): OnboardingRequirement[] {
  return missingOnboardingRequirements(draft).filter((item) => targets[item].step === step);
}

export function targetForOnboardingRequirement(requirement: OnboardingRequirement): OnboardingRequirementTarget {
  return targets[requirement];
}

export function validationIssueForRequirement(requirement: OnboardingRequirement): OnboardingValidationIssue {
  return { requirement, target: targets[requirement], message: messages[requirement] };
}

/** A focus route can point at a grouped field; preserve its declared order. */
export function requirementsForOnboardingFocus(focus?: string): readonly OnboardingRequirement[] {
  if (!focus) return [];
  return (Object.keys(targets) as OnboardingRequirement[]).filter((requirement) => targets[requirement].focus === focus);
}

/** Maps assessment wording to the actual field; legacy assessments use grouped wording. */
export function targetForAssessmentMissing(missing: readonly string[]): OnboardingRequirementTarget | null {
  const value = missing[0];
  if (!value) return null;
  const requirement = requirementForAssessmentMissing(missing);
  return requirement ? targets[requirement] : null;
}

export function requirementForAssessmentMissing(missing: readonly string[]): OnboardingRequirement | null {
  const value = missing[0];
  if (!value) return null;
  const exact: Record<string, OnboardingRequirement> = {
    'recent weekly running': 'recent_weekly_running',
    'recent longest session': 'longest_session_minutes',
    'comfortable continuous running duration': 'comfortable_running_minutes',
    'recent interruption': 'recent_interruption',
    goal: 'goal',
    'training days': 'training_days',
    'available minutes': 'available_minutes',
    'adult confirmation': 'adult_confirmation',
    'walking comfort': 'walking_comfort',
    'first-5K experience': 'first_5k_experience',
  };
  return exact[value] ?? null;
}

export function editPathForRequirement(requirement: OnboardingRequirement, returnTo = '/plan') {
  const target = targets[requirement];
  return `/onboarding/${target.step}?returnTo=${encodeURIComponent(returnTo)}&focus=${target.focus}`;
}
