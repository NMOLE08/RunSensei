import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import type { CurrentAccountPlanFacts } from '@/application/planFacts';

export type PreparedGoal = '5k' | '10k' | 'half_marathon' | 'marathon';

export function preparedDraft(goal: PreparedGoal, ownerId = 'account-a', overrides: Record<string, unknown> = {}): FitnessAssessmentDraft {
  const evidence = goal === '10k'
    ? { weeklyMinutes: '150', longestSessionMinutes: '60', comfortableRunMinutes: '40' }
    : goal === 'marathon'
      ? { weeklyMinutes: '240', longestSessionMinutes: '90', comfortableRunMinutes: '60' }
      : goal === 'half_marathon'
        ? { weeklyMinutes: '110', longestSessionMinutes: '45', comfortableRunMinutes: '40' }
        : { weeklyMinutes: '60', longestSessionMinutes: '25', comfortableRunMinutes: '25' };
  const days = goal === '5k' || goal === 'half_marathon' ? [1, 3, 6] : [1, 3, 5, 6];
  return {
    ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Calcutta'),
    goal,
    goalFocus: 'finish' as const,
    trainingObjective: 'finish' as const,
    adultAgeConfirmed: true,
    canWalk30MinutesComfortably: true,
    first5kExperience: 'none_or_limited' as const,
    healthConcern: false,
    currentTrainingStatus: 'currently_training' as const,
    interruption: 'none' as const,
    interruptionReason: 'schedule_or_travel' as const,
    lastRunningDate: '2026-12-30',
    currentCapabilityConfirmedAt: '2026-12-30',
    weeklyEvidenceConfirmedAt: '2026-12-30',
    longestSessionDate: '2026-12-30',
    planStartDate: '2027-01-04',
    trainingDays: days,
    minuteLimits: Object.fromEntries(days.map((day) => [day, '120'])),
    minuteLimitConfirmedDays: days,
    preferredLongDay: days.at(-1),
    ...evidence,
    ...overrides,
  } as FitnessAssessmentDraft;
}

export function preparedFacts(goal: PreparedGoal, overrides: { ownerId?: string; draft?: FitnessAssessmentDraft; assessment?: ReturnType<typeof assessFitness>; activeSnapshot?: CurrentAccountPlanFacts['activeSnapshot']; pathwayIntent?: CurrentAccountPlanFacts['pathwayIntent'] } = {}): CurrentAccountPlanFacts {
  const ownerId = overrides.ownerId ?? 'account-a';
  const draft = overrides.draft ?? preparedDraft(goal, ownerId);
  const assessment = overrides.assessment ?? assessFitness(draft, '2027-01-01T00:00:00.000Z');
  return {
    ownerId,
    draft,
    assessment,
    activeSnapshot: overrides.activeSnapshot ?? null,
    pathwayIntent: overrides.pathwayIntent ?? null,
  };
}

export function activeAuthorizedSnapshot(): CurrentAccountPlanFacts['activeSnapshot'] {
  return { plan: { mode: 'real', recommendationState: 'active' } } as unknown as CurrentAccountPlanFacts['activeSnapshot'];
}
