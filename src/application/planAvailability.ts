import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { TrainingRepository } from '@/data/repositories';
import { evaluatePlanAvailability, type PlanAvailability } from '@/domain/assessment/planAvailability';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft, type FitnessAssessmentDraft, type FitnessAssessmentResult } from '@/domain/assessment/types';
import type { PlanSnapshot } from '@/domain/training/entities';
import { loadRemoteOnboardingAnswers } from '@/services/account/onboardingProgress';
import { requireActiveAccountId } from './localAccount';

/** Reads only the active authenticated account's local planning facts. */
export async function openPlanAvailability(): Promise<PlanAvailability> {
  const facts = await loadCurrentAccountPlanFacts();
  const availability=evaluatePlanAvailability({ draft: facts.draft, assessment: facts.assessment, activeSnapshot: facts.activeSnapshot });
  // Historical saved weeks remain readable without a release-service round trip.
  if(facts.draft?.goal==='5k'&&!facts.activeSnapshot) {
    const {getCurrentBeginner5kPublicationStatus}=await import('./currentBeginner5kPublication');
    const publication=await getCurrentBeginner5kPublicationStatus();
    if(await requireActiveAccountId()!==facts.ownerId)throw new Error('Account changed while reading plan status.');
    return {...availability,consumerStatus:publication.status};
  }
  return availability;
}

export type CurrentAccountPlanFacts = { ownerId: string; draft: FitnessAssessmentDraft | null; assessment: FitnessAssessmentResult | null; activeSnapshot: PlanSnapshot | null };

/** Shared account-scoped facts for status and non-persistent research previews. */
export async function loadCurrentAccountPlanFacts(): Promise<CurrentAccountPlanFacts> {
  const ownerId = await requireActiveAccountId();
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  const assessments = new FitnessAssessmentRepository(database, ownerId);
  const plans = new TrainingRepository(database, ownerId);
  const [localDraft, latestAssessment, execution] = await Promise.all([assessments.loadDraft(), assessments.latestResult(), plans.getActiveExecution()]);
  // A runner can sign in on a second device before a local draft exists. Read
  // their account-owned Supabase answers through RLS, but do not claim, alter,
  // or persist any legacy/other-account local data as part of this status read.
  const draft = localDraft ? normalizeFitnessAssessmentDraft(localDraft) : await loadAccountDraft(ownerId);
  // Prefer the immutable assessment for the exact current evidence. Timestamp
  // ordering alone can select a different historical or legacy assessment.
  // If no exact result exists, retain the latest different result so genuine
  // evidence edits still surface as an outdated assessment.
  const assessment = draft
    ? await assessments.resultForInputFingerprint(assessmentEvidenceFingerprint(draft)) ?? latestAssessment
    : latestAssessment;
  return { ownerId, draft, assessment, activeSnapshot: execution?.snapshot ?? null };
}

async function loadAccountDraft(ownerId: string): Promise<FitnessAssessmentDraft | null> {
  try {
    const answers = await loadRemoteOnboardingAnswers(ownerId);
    if (!answers) return null;
    return normalizeFitnessAssessmentDraft({
      ...emptyFitnessAssessmentDraft(ownerId, typeof answers.timezone === 'string' ? answers.timezone : 'UTC'),
      ...answers,
      id: 'system-a',
      ownerId,
      updatedAt: typeof answers.updatedAt === 'string' ? answers.updatedAt : '',
    } as FitnessAssessmentDraft);
  } catch (error) {
    throw new Error('Saved runner information could not be read while offline. Reconnect and try again.', { cause: error });
  }
}
