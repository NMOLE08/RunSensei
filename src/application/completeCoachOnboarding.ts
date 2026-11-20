import type { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { saveFitnessAssessmentDraft } from './fitnessAssessmentOnboarding';
import { completeRemoteOnboarding } from '@/services/account/onboardingProgress';
import type { CoachId, FitnessAssessmentDraft } from '@/domain/assessment/types';

type Dependencies = {
  saveDraft: typeof saveFitnessAssessmentDraft;
  completeRemote: typeof completeRemoteOnboarding;
};
const defaults: Dependencies = { saveDraft: saveFitnessAssessmentDraft, completeRemote: completeRemoteOnboarding };

/** Local choice is saved first; only the authenticated remote RPC can mark onboarding complete. */
export async function completeCoachOnboarding(repository: FitnessAssessmentRepository, draft: FitnessAssessmentDraft, coachId: CoachId, dependencies: Dependencies = defaults): Promise<FitnessAssessmentDraft> {
  if (draft.coachId !== coachId) throw new Error('coach_selection_not_current');
  if (!draft.coachIntroAcknowledged) throw new Error('coach_introduction_required');
  const persisted = await dependencies.saveDraft(repository, draft);
  await dependencies.completeRemote(persisted);
  return persisted;
}
