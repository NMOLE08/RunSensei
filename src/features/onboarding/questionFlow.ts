import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import type { OnboardingRequirement, OnboardingStep } from '@/domain/assessment/onboardingRequirements';

export type OnboardingQuestionPart =
  | 'running-history' | 'running-capacity' | 'running-context' | 'running-evidence' | 'running-interruption'
  | 'performance-details' | 'performance-context'
  | 'goal-choice' | 'first5-check' | 'goal-intent' | 'goal-dates' | 'goal-preferences' | 'foundation-settings'
  | 'availability-days' | 'availability-preferred' | 'availability-unavailable'
  | 'assessment' | 'coach';

export type OnboardingQuestionScreen = Readonly<{
  id: OnboardingQuestionPart;
  routeStep: OnboardingStep;
  title: string;
  description: string;
  questionCount: 1 | 2 | 3;
  requirements: readonly OnboardingRequirement[];
}>;

/** The only weekly-frequency choices represented by the existing research-foundation contract. */
export const supportedFoundationFrequencies = [2, 3] as const;

const screen = (id: OnboardingQuestionPart, routeStep: OnboardingStep, title: string, description: string, questionCount: 1 | 2 | 3, requirements: readonly OnboardingRequirement[] = []): OnboardingQuestionScreen => ({ id, routeStep, title, description, questionCount, requirements });

/** UI-only sequencing. It deliberately does not alter the broad persisted route contract. */
export function activeOnboardingQuestionScreens(draft: FitnessAssessmentDraft, experimental5kPreviewEnabled: boolean): readonly OnboardingQuestionScreen[] {
  const screens: OnboardingQuestionScreen[] = [
    screen('running-history', 'running', 'Your recent running', 'A few facts help us understand your current routine.', 3, ['recent_weekly_running', 'weekly_running_minutes']),
    screen('running-capacity', 'running', 'Your current capacity', 'Use what you can comfortably do now, not an old personal best.', 3, ['longest_session_minutes', 'longest_session_date', 'comfortable_running_minutes']),
    screen('running-context', 'running', 'Your running today', 'This separates current training from older running history.', 3, ['current_training_context']),
    screen('running-interruption', 'running', 'Any recent interruption?', 'An honest answer helps preserve the right safety checks.', 2, ['recent_interruption']),
    screen('performance-details', 'performance', 'A recent result, if you have one', 'This is optional. Record a completed effort, not a goal.', 3),
    screen('performance-context', 'performance', 'About that effort', 'Optional context helps us interpret the result.', 3),
    screen('goal-choice', 'goal', 'What are you working toward?', 'Choose the distance that matters most right now.', 1, ['goal']),
  ];
  if (draft.goal === 'half_marathon' && draft.currentTrainingStatus === 'currently_training') screens.push(screen('running-evidence', 'running', 'Confirm your current evidence', 'Confirm only facts that describe what you can repeat today.', 1, ['current_capacity_confirmation']));
  if (draft.goal === '5k') screens.push(screen('first5-check', 'running', 'Your first 5K starting point', 'These required answers check the available draft pathway. They are not medical clearance.', 3, ['adult_confirmation', 'walking_comfort', 'first_5k_experience']));
  screens.push(
    screen('goal-intent', 'goal', 'What does success look like?', 'Choose the outcome you want from this goal.', 2),
    screen('goal-dates', 'goal', 'When do you want to begin?', 'Use your local calendar dates. A fixed event date is optional.', 3, ['plan_start_date', 'goal_date']),
    screen('goal-preferences', 'goal', 'Your preferences', 'These affect presentation and scheduling context, not your coaching policy.', 2),
  );
  if (experimental5kPreviewEnabled) screens.push(screen('foundation-settings', 'goal', 'How many days each week?', 'Choose the number of research-foundation sessions before selecting available weekdays.', 3));
  screens.push(
    screen('availability-days', 'availability', 'Which days can you train?', 'Choose every day that is genuinely available to you.', 1, ['training_days']),
    screen('availability-preferred', 'availability', 'Which day suits your longest workout?', 'We will try to use it while preserving recovery between sessions.', 1),
    screen('availability-unavailable', 'availability', 'Dates to avoid', 'Add known exceptions if you have them. This is optional.', 1),
    screen('assessment', 'assessment', 'Your starting point', 'Review your saved information before continuing.', 1),
    screen('coach', 'coach', 'Choose your coach', 'Different coaches. Same finish line.', 1, ['coach_selection', 'coach_introduction']),
  );
  return screens;
}

export function resolveOnboardingQuestionScreen(screens: readonly OnboardingQuestionScreen[], routeStep: OnboardingStep, requestedPart?: string): OnboardingQuestionScreen {
  const requested = requestedPart ? screens.find((item) => item.id === requestedPart && item.routeStep === routeStep) : null;
  return requested ?? screens.find((item) => item.routeStep === routeStep) ?? screens[0]!;
}

export function indexOfOnboardingQuestionScreen(screens: readonly OnboardingQuestionScreen[], part: OnboardingQuestionPart): number {
  return screens.findIndex((item) => item.id === part);
}

export function partForOnboardingFocus(focus?: string): OnboardingQuestionPart | null {
  const map: Record<string, OnboardingQuestionPart> = {
    'weekly-running': 'running-history', 'longest-session-minutes': 'running-capacity', 'longest-session-date': 'running-capacity', 'comfortable-running-minutes': 'running-capacity',
    'current-training-context': 'running-context', 'running-evidence-confirmation': 'running-evidence', 'recent-interruption': 'running-interruption', 'health-concern': 'running-interruption',
    'adult-confirmation': 'first5-check', 'walking-comfort': 'first5-check', 'first-5k-experience': 'first5-check',
    goal: 'goal-choice', 'plan-start-date': 'goal-dates', 'goal-date': 'goal-dates',
    'foundation-frequency': 'foundation-settings', 'training-days': 'availability-days', 'available-minutes': 'availability-preferred', 'available-minutes-confirmation': 'availability-preferred',
    'coach-selection': 'coach', 'coach-introduction': 'coach',
  };
  return focus ? map[focus] ?? null : null;
}
