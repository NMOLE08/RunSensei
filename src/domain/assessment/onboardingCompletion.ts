import type { FitnessAssessmentDraft } from './types';
import { missingOnboardingRequirements, targetForOnboardingRequirement } from './onboardingRequirements';

/** Data-completeness check only; it is deliberately not a coaching eligibility decision. */
export function missingOnboardingFields(draft: FitnessAssessmentDraft): string[] {
  return missingOnboardingRequirements(draft).map((requirement) => targetForOnboardingRequirement(requirement).label);
}

export const isOnboardingComplete = (draft: FitnessAssessmentDraft) => missingOnboardingFields(draft).length === 0;
