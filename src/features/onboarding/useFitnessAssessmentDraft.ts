import { useCallback, useEffect, useRef, useState } from 'react';
import { openFitnessAssessmentOnboarding, persistAndCreateFitnessAssessment, saveFitnessAssessmentDraft } from '@/application/fitnessAssessmentOnboarding';
import type { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import type { CoachId, FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import { saveRemoteOnboardingProgress } from '@/services/account/onboardingProgress';
import { completeCoachOnboarding } from '@/application/completeCoachOnboarding';

export function useFitnessAssessmentDraft() {
  const [draft, setDraft] = useState<FitnessAssessmentDraft | null>(null); const [repository, setRepository] = useState<FitnessAssessmentRepository | null>(null); const [error, setError] = useState<string | null>(null); const [attempt, setAttempt] = useState(0);
  const latestDraft = useRef<FitnessAssessmentDraft | null>(null);
  const localSaveQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { let alive = true; openFitnessAssessmentOnboarding().then(({ repository: next, initial }) => { if (alive) { latestDraft.current = initial; setRepository(next); setDraft(initial); } }).catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : 'The assessment could not be opened.'); }); return () => { alive = false; }; }, [attempt]);
  const queueLocalSave = useCallback((value: FitnessAssessmentDraft, currentRepository: FitnessAssessmentRepository) => {
    // Recover the queue after a failed write so a later user retry can persist.
    localSaveQueue.current = localSaveQueue.current.catch(() => undefined).then(async () => {
      const persisted = await saveFitnessAssessmentDraft(currentRepository, value);
      // A later edit may already be in memory while this queued write finishes.
      // Never replace that newer draft with this older queued value.
      if (latestDraft.current === value) latestDraft.current = persisted;
    });
    return localSaveQueue.current;
  }, []);
  const update = useCallback((change: Partial<FitnessAssessmentDraft>): Promise<void> => {
    const base = latestDraft.current ?? draft;
    if (!base || !repository) return Promise.resolve();
    // A confirmation is evidence supplied by the runner, not a timestamp we may refresh in the background.
    // Any change to the aggregate or related running facts requires a fresh explicit confirmation.
    const invalidatesWeeklyConfirmation = Object.keys(change).some((field) => weeklyEvidenceFields.has(field as keyof FitnessAssessmentDraft));
    const next = { ...base, ...change, ...(invalidatesWeeklyConfirmation && !('weeklyEvidenceConfirmedAt' in change) ? { weeklyEvidenceConfirmedAt: '', currentCapabilityConfirmedAt: '', foundationEvidenceConfirmedAt: '', foundationPostBreakConfirmed: false } : {}), updatedAt: new Date().toISOString() };
    latestDraft.current = next; setDraft(next);
    const saved = queueLocalSave(next, repository);
    void saved.catch(() => setError('Your latest change could not be saved.'));
    return saved;
  }, [draft, repository, queueLocalSave]);
  const assess = useCallback(async (): Promise<FitnessAssessmentResult | null> => { if (!repository) return null; try { await localSaveQueue.current; const current = latestDraft.current; if (!current) return null; const assessed = await persistAndCreateFitnessAssessment(repository, current); latestDraft.current = assessed.draft; setDraft(assessed.draft); return assessed.result; } catch (reason) { setError(reason instanceof Error ? reason.message : 'The assessment could not be saved.'); return null; } }, [repository]);
  const syncRemote = useCallback(async (step: string) => { try { await localSaveQueue.current; const current = latestDraft.current; if (!current) return; await saveRemoteOnboardingProgress(step, current); } catch { setError('This device saved your draft, but your account could not be updated. Check your connection and try again.'); } }, []);
  const saveAndSync = useCallback(async (step: string): Promise<boolean> => { if (!repository) return false; try { await localSaveQueue.current; const current = latestDraft.current; if (!current) return false; const persisted = await saveFitnessAssessmentDraft(repository, current); latestDraft.current = persisted; setDraft(persisted); await saveRemoteOnboardingProgress(step, persisted); return true; } catch { setError('Your changes were saved on this device, but your account could not be updated. Check your connection and try again.'); return false; } }, [repository]);
  const completeWithCoach = useCallback(async (coachId: CoachId): Promise<boolean> => { if (!repository) return false; try { await localSaveQueue.current; const current = latestDraft.current; if (!current) return false; const persisted = await completeCoachOnboarding(repository, current, coachId); latestDraft.current = persisted; setDraft(persisted); return true; } catch { setError('Your coach choice could not be completed. Your other onboarding answers are still saved; please try again.'); return false; } }, [repository]);
  return { draft, error, update, assess, syncRemote, saveAndSync, completeWithCoach, retry: () => { setError(null); setAttempt((value) => value + 1); } };
}

const weeklyEvidenceFields = new Set<keyof FitnessAssessmentDraft>([
  'weeklyDistance', 'weeklyDistanceUnit', 'weeklyMinutes', 'historyDays',
  'longestSessionMinutes', 'longestSessionDate', 'comfortableRunMinutes', 'interruption', 'healthConcern', 'currentTrainingStatus', 'lastRunningDate', 'interruptionReason',
]);
