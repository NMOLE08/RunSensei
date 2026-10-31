import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';
import type { OnboardingDraft } from './types';

/** Synthetic schedule only; these limits are not the runner's actual availability. */
export function withDemoScheduleAssumptions(draft: OnboardingDraft): OnboardingDraft {
  const goal = draft.goalDistance === '5000' ? '5k_completion' : draft.goalDistance === '10000' ? '10k_completion' : 'half_marathon_completion';
  const template = flexibleDemoTemplates.find((item) => item.supportedGoal === goal)!;
  const days = [1, 3, 6];
  const minutes = days.map((_, index) => Math.ceil(Math.max(...template.phases.flatMap((phase) => (phase.weeklySessions ?? [phase.sessions]).map((week) => week[index].durationSeconds))) / 60));
  return { ...draft, trainingDays: days, preferredLongRunDay: 6, minuteLimits: Object.fromEntries(days.map((day, index) => [day, String(minutes[index])])), unavailableDates: '' };
}
