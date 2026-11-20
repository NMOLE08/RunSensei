import { missingOnboardingFields } from '@/domain/assessment/onboardingCompletion';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';

it('requires data completeness without making an eligibility or medical decision', () => {
  const draft = emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata');
  expect(missingOnboardingFields(draft)).toEqual(expect.arrayContaining(['plan start date', 'training days', 'adult confirmation']));
  const complete = { ...draft, weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-10-30', comfortableRunMinutes: '20', planStartDate: '2026-11-10', trainingDays: [1, 3, 6], minuteLimits: { 1: '30', 3: '30', 6: '40' }, minuteLimitConfirmedDays: [1, 3, 6], interruption: 'none' as const, adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' as const, coachId: 'moss' as const, coachIntroAcknowledged: true };
  expect(missingOnboardingFields(complete)).toEqual([]);
});

it('keeps a two-day runner profile valid without claiming a two-day programme exists', () => {
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-10-30', comfortableRunMinutes: '20', planStartDate: '2026-11-10', trainingDays: [1, 4], minuteLimits: { 1: '45', 4: '45' }, minuteLimitConfirmedDays: [1, 4], interruption: 'none' as const, adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' as const, coachId: 'jett' as const, coachIntroAcknowledged: true };
  expect(missingOnboardingFields(draft)).toEqual([]);
  expect(draft.minuteLimitConfirmedDays).toEqual([1, 4]);
});
