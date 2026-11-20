import { completeRemoteOnboarding, onboardingAnswers } from '@/services/account/onboardingProgress';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';

jest.mock('@/services/auth/supabase', () => ({ supabase: {} }));

describe('account onboarding answer mapping', () => {
  it('serializes the explicit foundation frequency separately from available weekdays', () => {
    const draft = {
      ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'),
      trainingDays: [0, 1, 3, 6],
      foundationFrequency: 3 as const,
      foundationEvidenceConfirmedAt: '2027-01-01',
      coachId: 'moss' as const,
      coachIntroAcknowledged: true,
    };
    const answers = onboardingAnswers(draft);
    expect(answers).toMatchObject({
      foundationFrequency: 3,
      foundationEvidenceConfirmedAt: '2027-01-01',
      trainingDays: [0, 1, 3, 6],
      coachId: 'moss',
      coachIntroAcknowledged: true,
    });
  });

  it('refuses to mark onboarding complete without an explicit coach choice', async () => {
    await expect(completeRemoteOnboarding(emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'))).rejects.toThrow('coach_selection_required');
  });

  it('keeps date-only and manual distance strings identical in the serialized account payload', () => {
    const draft = {
      ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'),
      weeklyDistance: '10.25', weeklyDistanceUnit: 'km' as const,
      longestSessionDate: '2026-11-02', lastRunningDate: '2026-11-05', performanceDate: '2026-10-30',
      planStartDate: '2026-11-10', goalDateFixed: true, goalDate: '2027-03-01', unavailableDates: '2026-11-14, 2026-11-18',
    };
    expect(onboardingAnswers(draft)).toMatchObject({
      weeklyDistance: '10.25', weeklyDistanceUnit: 'km', longestSessionDate: '2026-11-02', lastRunningDate: '2026-11-05',
      performanceDate: '2026-10-30', planStartDate: '2026-11-10', goalDate: '2027-03-01', unavailableDates: '2026-11-14, 2026-11-18',
    });
  });
});
