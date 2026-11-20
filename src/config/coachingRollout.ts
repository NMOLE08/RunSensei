import type { AssessmentGoal } from '@/domain/assessment/types';

export type CoachingRolloutEntry = Readonly<{
  goal: Extract<AssessmentGoal, '5k' | '10k' | 'half_marathon' | 'marathon'>;
  displayName: string;
  position: number;
  onboardingDescription: string;
}>;

/** Presentation-only roadmap. It never authorizes a policy or an active plan. */
export const coachingRollout: readonly CoachingRolloutEntry[] = Object.freeze([
  { goal: '5k', displayName: '5K', position: 1, onboardingDescription: 'Beginner 5K is Torto’s first internal coaching pilot. Plan availability still depends on your saved evidence and approved policy content.' },
  { goal: '10k', displayName: '10K', position: 2, onboardingDescription: 'Personalized 10K coaching is planned after the beginner 5K lifecycle is validated.' },
  { goal: 'half_marathon', displayName: 'Half marathon', position: 3, onboardingDescription: 'Half-marathon planning is currently research-only and cannot be activated as a training plan.' },
  { goal: 'marathon', displayName: 'Full marathon', position: 4, onboardingDescription: 'Personalized full-marathon coaching is planned and is not available for activation yet.' },
]);

export function coachingRolloutEntry(goal: AssessmentGoal): CoachingRolloutEntry | null {
  return coachingRollout.find((entry) => entry.goal === goal) ?? null;
}

export function coachingRolloutDescription(goal: AssessmentGoal): string | null {
  return coachingRolloutEntry(goal)?.onboardingDescription ?? null;
}
