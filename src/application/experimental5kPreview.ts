import { loadCurrentAccountPlanFacts } from './planAvailability';
import { createExperimental5kPreview, type Experimental5kPreview, type Experimental5kPreviewBlocked } from '@/domain/research/experimental5kPreview';

export type CurrentExperimental5kPreview = Experimental5kPreview | Experimental5kPreviewBlocked | { kind: 'unavailable'; reasonCodes: readonly string[]; researchOnly: true; productionEligible: false };

/** Reads current account-owned facts only. It performs no persistence. */
export async function openCurrentExperimental5kPreview(nowDate: string): Promise<CurrentExperimental5kPreview> {
  const facts = await loadCurrentAccountPlanFacts();
  if (!facts.draft) return { kind: 'unavailable', reasonCodes: ['onboarding_not_started'], researchOnly: true, productionEligible: false };
  return createExperimental5kPreview({ ownerId: facts.ownerId, draft: facts.draft, assessment: facts.assessment, nowDate });
}
