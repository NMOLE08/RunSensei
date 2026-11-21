import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { activeOnboardingQuestionScreens, partForOnboardingFocus, resolveOnboardingQuestionScreen, supportedFoundationFrequencies } from '@/features/onboarding/questionFlow';
import { coachingRolloutDescription } from '@/config/coachingRollout';

describe('question-by-question onboarding flow', () => {
  const draft = () => emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata');

  it('keeps every visible screen to at most three logical questions', () => {
    expect(activeOnboardingQuestionScreens(draft(), true).every((screen) => screen.questionCount <= 3)).toBe(true);
  });

  it('places the goal-dependent first-5K check after goal selection', () => {
    const screens = activeOnboardingQuestionScreens(draft(), false);
    expect(screens.findIndex((screen) => screen.id === 'first5-check')).toBeGreaterThan(screens.findIndex((screen) => screen.id === 'goal-choice'));
  });

  it('starts V2 with the goal and keeps effort evidence conditional for currently active runners', () => {
    const inactive = activeOnboardingQuestionScreens({ ...draft(), currentTrainingStatus: 'first_time_runner' }, false);
    const active = activeOnboardingQuestionScreens({ ...draft(), currentTrainingStatus: 'currently_training' }, false);
    expect(inactive[0]?.id).toBe('goal-choice');
    expect(inactive.some((screen) => screen.id === 'running-effort')).toBe(false);
    expect(active.some((screen) => screen.id === 'running-effort')).toBe(true);
  });

  it('keeps preferred training frequency separate from available weekdays and research foundation frequency', () => {
    const screens = activeOnboardingQuestionScreens(draft(), true);
    expect(screens.findIndex((screen) => screen.id === 'availability-frequency')).toBeLessThan(screens.findIndex((screen) => screen.id === 'availability-days'));
    expect(screens.find((screen) => screen.id === 'availability-frequency')?.requirements).toEqual([]);
    expect(screens.find((screen) => screen.id === 'foundation-settings')?.requirements).toEqual([]);
  });

  it('omits first-5K questions for a non-5K goal', () => {
    const screens = activeOnboardingQuestionScreens({ ...draft(), goal: '10k' }, false);
    expect(screens.some((screen) => screen.id === 'first5-check')).toBe(false);
  });

  it('keeps focus links compatible with the broad persisted route', () => {
    expect(partForOnboardingFocus('adult-confirmation')).toBe('first5-check');
    const screens = activeOnboardingQuestionScreens(draft(), false);
    expect(resolveOnboardingQuestionScreen(screens, 'running', 'first5-check').id).toBe('first5-check');
  });

  it('falls back safely when a stale part does not belong to its route', () => {
    const screens = activeOnboardingQuestionScreens(draft(), false);
    expect(resolveOnboardingQuestionScreen(screens, 'goal', 'availability-days').id).toBe('goal-choice');
  });

  it('places the existing supported frequency choice before weekday availability', () => {
    const screens = activeOnboardingQuestionScreens(draft(), true);
    expect(supportedFoundationFrequencies).toEqual([2, 3]);
    expect(screens.findIndex((screen) => screen.id === 'foundation-settings')).toBeLessThan(screens.findIndex((screen) => screen.id === 'availability-days'));
  });

  it('asks for a longest-workout preference after weekday availability without requiring time inputs', () => {
    const screens = activeOnboardingQuestionScreens(draft(), true);
    const days = screens.findIndex((screen) => screen.id === 'availability-days');
    const preference = screens.findIndex((screen) => screen.id === 'availability-preferred');
    expect(preference).toBeGreaterThan(days);
    expect(screens.find((screen) => screen.id === 'availability-preferred')?.requirements).toEqual([]);
  });

  it('does not invent a frequency question when the research feature is disabled', () => {
    expect(activeOnboardingQuestionScreens(draft(), false).some((screen) => screen.id === 'foundation-settings')).toBe(false);
  });

  it('keeps later distance goals selectable while roadmap text does not imply activation', () => {
    const tenK = { ...draft(), goal: '10k' as const };
    expect(activeOnboardingQuestionScreens(tenK, false).some((screen) => screen.id === 'goal-choice')).toBe(true);
    expect(coachingRolloutDescription(tenK.goal)).toContain('planned');
  });
});
