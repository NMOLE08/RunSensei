import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { requireActiveAccountId } from '@/application/localAccount';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import { loadRemoteOnboardingAnswers } from '@/services/account/onboardingProgress';

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
/** Legacy anonymous onboarding data remains untouched until a separately consented migration exists. */
export async function openFitnessAssessmentOnboarding() {
  const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new FitnessAssessmentRepository(database, ownerId); const saved = await repository.loadDraft();
  if (saved) return { repository, initial: normalizeFitnessAssessmentDraft(saved) };
  // A new device can resume the account's remote draft. Legacy anonymous data
  // is intentionally excluded and never attached to an account automatically.
  try {
    const answers = await loadRemoteOnboardingAnswers(ownerId);
    if (answers) {
      const initial = normalizeFitnessAssessmentDraft({ ...emptyFitnessAssessmentDraft(ownerId, timezone()), ...answers, id: 'system-a', ownerId, updatedAt: new Date().toISOString() } as FitnessAssessmentDraft);
      await repository.saveDraft(initial);
      return { repository, initial };
    }
  } catch { /* Offline startup retains an empty local draft until sync can resume. */ }
  return { repository, initial: emptyFitnessAssessmentDraft(ownerId, timezone()) };
}
/**
 * Persists exactly the object supplied by the caller.  `updatedAt` is record
 * metadata, not evidence, but preserving it avoids a save/assess race and
 * makes the object assessed identical to the object Plan later reloads.
 */
export async function saveFitnessAssessmentDraft(repository: FitnessAssessmentRepository, draft: FitnessAssessmentDraft) {
  const persisted = normalizeFitnessAssessmentDraft({ ...draft, updatedAt: draft.updatedAt || new Date().toISOString() });
  await repository.saveDraft(persisted);
  return persisted;
}

/** Saves a draft first, then creates an immutable assessment from that exact persisted value. */
export async function persistAndCreateFitnessAssessment(repository: FitnessAssessmentRepository, draft: FitnessAssessmentDraft) {
  const persisted = await saveFitnessAssessmentDraft(repository, draft);
  const result = assessFitness(persisted);
  await repository.saveResult(result, persisted);
  return { draft: persisted, result };
}

/** Backwards-compatible result-only entry point used by existing callers and tests. */
export async function createFitnessAssessment(repository: FitnessAssessmentRepository, draft: FitnessAssessmentDraft) {
  return (await persistAndCreateFitnessAssessment(repository, draft)).result;
}
