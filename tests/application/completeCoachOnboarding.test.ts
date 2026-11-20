import { completeCoachOnboarding } from '@/application/completeCoachOnboarding';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import type { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';

const completedDraft = (coachId: 'moss' | 'jett'): FitnessAssessmentDraft => ({
  ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'),
  goal: 'half_marathon', goalDate: '2027-03-01', goalDateFixed: true,
  weeklyMinutes: '90', longestSessionMinutes: '45', longestSessionDate: '2026-11-01', comfortableRunMinutes: '30',
  interruption: 'none', currentTrainingStatus: 'currently_training', planStartDate: '2026-11-09',
  trainingDays: [1, 3, 6], minuteLimits: { 1: '45', 3: '45', 6: '60' }, minuteLimitConfirmedDays: [1, 3, 6], coachId, coachIntroAcknowledged: true,
});

describe('coach onboarding completion boundary', () => {
  it('persists the exact choice before authenticated remote completion and preserves the running goal', async () => {
    const saved: FitnessAssessmentDraft[] = [];
    const remote: FitnessAssessmentDraft[] = [];
    const draft = completedDraft('jett');
    const result = await completeCoachOnboarding({} as FitnessAssessmentRepository, draft, 'jett', {
      saveDraft: async (_repository, value) => { saved.push(value); return value; },
      completeRemote: async (value) => { remote.push(value); },
    });
    expect(saved).toEqual([draft]);
    expect(remote).toEqual([draft]);
    expect(result.goal).toBe('half_marathon');
    expect(result.coachId).toBe('jett');
  });

  it('does not invoke completion for a stale coach choice or hide remote failure', async () => {
    const saveDraft = jest.fn(async (_repository: FitnessAssessmentRepository, value: FitnessAssessmentDraft) => value);
    const completeRemote = jest.fn(async () => { throw new Error('network unavailable'); });
    await expect(completeCoachOnboarding({} as FitnessAssessmentRepository, completedDraft('moss'), 'jett', { saveDraft, completeRemote })).rejects.toThrow('coach_selection_not_current');
    expect(saveDraft).not.toHaveBeenCalled();
    expect(completeRemote).not.toHaveBeenCalled();
    await expect(completeCoachOnboarding({} as FitnessAssessmentRepository, completedDraft('moss'), 'moss', { saveDraft, completeRemote })).rejects.toThrow('network unavailable');
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(completeRemote).toHaveBeenCalledTimes(1);
  });

  it('cannot complete after a restart unless intro completion or Skip Intro was persisted', async () => {
    const draft = { ...completedDraft('jett'), coachIntroAcknowledged: false };
    await expect(completeCoachOnboarding({} as FitnessAssessmentRepository, draft, 'jett', {
      saveDraft: async (_repository, value) => value,
      completeRemote: async () => undefined as never,
    })).rejects.toThrow('coach_introduction_required');
  });
});
