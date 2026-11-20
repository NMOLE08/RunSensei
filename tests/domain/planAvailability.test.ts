import { assessFitness } from '@/domain/assessment/assessFitness';
import { evaluatePlanAvailability } from '@/domain/assessment/planAvailability';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';

const draft = (trainingDays: number[], overrides = {}) => ({ ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-11-01', comfortableRunMinutes: '25', interruption: 'none' as const, adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'substantial' as const, planStartDate: '2026-11-10', trainingDays, minuteLimits: Object.fromEntries(trainingDays.map((day) => [day, '60'])), ...overrides });
const result = (value: ReturnType<typeof draft>) => assessFitness(value, '2026-11-03T00:00:00.000Z');

it('keeps a two-day schedule intact and explains both schedule and release limitations', () => {
  const value = draft([4, 6]);
  const availability = evaluatePlanAvailability({ draft: value, assessment: result(value), activeSnapshot: null });
  expect(availability.trainingDays).toEqual([4, 6]);
  expect(availability.reasons).toEqual(expect.arrayContaining(['unsupported_two_day_schedule', 'draft_policy_not_release_ready', 'no_active_plan']));
});

it('does not pretend a compatible three-day schedule produces a released plan', () => {
  const value = draft([1, 3, 6]);
  const availability = evaluatePlanAvailability({ draft: value, assessment: result(value), activeSnapshot: null });
  expect(availability.state).toBe('plan_unavailable');
  expect(availability.reasons).toEqual(expect.arrayContaining(['draft_policy_not_release_ready', 'no_active_plan']));
});

it('shows missing assessment facts rather than treating onboarding completion as a plan', () => {
  const value = { ...draft([1, 3, 6]), interruption: 'unknown' as const };
  const availability = evaluatePlanAvailability({ draft: value, assessment: result(value), activeSnapshot: null });
  expect(availability.state).toBe('plan_unavailable');
  expect(availability.reasons).toEqual(['assessment_needs_information']);
});

it('does not create a plan from account profile data', () => {
  const value = draft([1, 3, 6]);
  const availability = evaluatePlanAvailability({ draft: value, assessment: result(value), activeSnapshot: null });
  expect(availability.activeSnapshot).toBeNull();
  expect(availability.state).not.toBe('active_approved');
});

it('recognizes only an existing active real plan and never promotes a draft profile', () => {
  const value = draft([1, 3, 6]);
  const activeSnapshot = { plan: { mode: 'real', recommendationState: 'active' } } as never;
  const availability = evaluatePlanAvailability({ draft: value, assessment: result(value), activeSnapshot });
  expect(availability.state).toBe('active_approved');
  expect(availability.activeSnapshot).toBe(activeSnapshot);
});
