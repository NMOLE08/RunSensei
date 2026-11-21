import { editPathForRequirement, isReadyForCoachSelection, missingOnboardingRequirements, missingRequirementsForStep, requirementsForOnboardingFocus, targetForAssessmentMissing, validationIssueForRequirement } from '@/domain/assessment/onboardingRequirements';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';

function completeDraft() {
  return {
    ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'),
    weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-10-30', comfortableRunMinutes: '20', interruption: 'none' as const,
    adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' as const,
    planStartDate: '2026-11-10', trainingDays: [1, 3, 6], minuteLimits: { 1: '30', 3: '30', 6: '40' }, minuteLimitConfirmedDays: [1, 3, 6],
  };
}

it('blocks the running step when the assessment-required longest-session evidence is blank', () => {
  const draft = { ...completeDraft(), longestSessionMinutes: '', longestSessionDate: '' };
  expect(missingRequirementsForStep(draft, 'running')).toEqual(expect.arrayContaining(['longest_session_minutes', 'longest_session_date']));
});

it('treats an explicit no-interruption answer as complete rather than unknown', () => {
  expect(missingOnboardingRequirements(completeDraft())).not.toContain('recent_interruption');
});

it('does not make legacy per-day time evidence a requirement in the simplified availability flow', () => {
  const draft = { ...completeDraft(), minuteLimitConfirmedDays: [] };
  expect(missingRequirementsForStep(draft, 'availability')).not.toEqual(expect.arrayContaining(['available_minutes', 'available_minutes_confirmation']));
  expect(missingOnboardingRequirements(draft)).not.toEqual(expect.arrayContaining(['available_minutes', 'available_minutes_confirmation']));
});

it('routes a grouped assessment message to the actual longest-session field', () => {
  expect(targetForAssessmentMissing(['recent longest session'])).toEqual({ step: 'running', focus: 'longest-session-minutes', label: 'longest recent session duration' });
  expect(editPathForRequirement('longest_session_minutes')).toBe('/onboarding/running?returnTo=%2Fplan&focus=longest-session-minutes');
});

it('does not make optional performance evidence a required onboarding field', () => {
  expect(missingRequirementsForStep(completeDraft(), 'performance')).toEqual([]);
});

it('makes coach choice the final presentation-only onboarding requirement', () => {
  const draft = completeDraft();
  expect(missingOnboardingRequirements(draft)).toEqual(['coach_selection', 'coach_introduction']);
  expect(isReadyForCoachSelection(draft)).toBe(true);
  expect(missingRequirementsForStep(draft, 'coach')).toEqual(['coach_selection', 'coach_introduction']);
  expect(missingOnboardingRequirements({ ...draft, coachId: 'moss' })).toEqual(['coach_introduction']);
  expect(missingOnboardingRequirements({ ...draft, coachId: 'moss', coachIntroAcknowledged: true })).toEqual([]);
});

it('does not require first-5K declarations for other distance goals', () => {
  for (const goal of ['10k', 'half_marathon', 'marathon'] as const) {
    const missing = missingOnboardingRequirements({ ...completeDraft(), goal, adultAgeConfirmed: null, canWalk30MinutesComfortably: null, first5kExperience: 'unknown' });
    expect(missing).not.toEqual(expect.arrayContaining(['adult_confirmation']));
    expect(missing).not.toContain('walking_comfort');
    expect(missing).not.toContain('first_5k_experience');
  }
});

it('requests minutes explicitly when only distance is supplied for a current half-marathon baseline', () => {
  const missing = missingOnboardingRequirements({ ...completeDraft(), goal: 'half_marathon', currentTrainingStatus: 'currently_training', weeklyMinutes: '', weeklyDistance: '12' });
  expect(missing).toContain('weekly_running_minutes');
  expect(missing).toContain('current_capacity_confirmation');
});

it('maps a weekly-running validation route to the specific missing requirement and message', () => {
  expect(requirementsForOnboardingFocus('weekly-running')).toEqual(['weekly_running_minutes', 'recent_weekly_running']);
  expect(validationIssueForRequirement('weekly_running_minutes')).toMatchObject({
    target: { step: 'running', focus: 'weekly-running' },
    message: 'Enter your recent weekly running time for this half-marathon preparation check.',
  });
});

it('does not mistake optional V2 running-frequency context for required weekly running evidence', () => {
  const draft = {
    ...completeDraft(),
    goal: 'half_marathon' as const,
    currentTrainingStatus: 'currently_training' as const,
    observedWeeklyRunFrequency: 2 as const,
    weeklyMinutes: '',
    weeklyDistance: '12',
  };
  const missing = missingOnboardingRequirements(draft);
  expect(missing).toContain('weekly_running_minutes');
  expect(missing).not.toContain('recent_weekly_running');
  expect(missing).not.toContain('observed_weekly_run_frequency' as never);
});

it('does not demand false current-capacity confirmation from a returning runner', () => {
  const missing = missingOnboardingRequirements({ ...completeDraft(), goal: 'half_marathon', currentTrainingStatus: 'returning_after_break' });
  expect(missing).not.toContain('current_capacity_confirmation');
});

it('keeps legacy unanswered 5K confirmations unknown, while explicit No remains a valid answer', () => {
  const unanswered = { ...completeDraft(), adultAgeConfirmed: null, canWalk30MinutesComfortably: null };
  expect(missingOnboardingRequirements(unanswered)).toEqual(expect.arrayContaining(['adult_confirmation', 'walking_comfort']));
  const explicitNo = { ...completeDraft(), adultAgeConfirmed: false, canWalk30MinutesComfortably: false };
  expect(missingOnboardingRequirements(explicitNo)).not.toEqual(expect.arrayContaining(['adult_confirmation', 'walking_comfort']));
});
