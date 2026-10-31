import { useCallback, useEffect, useState } from 'react';
import { openOnboardingDrafts, saveOnboardingDraft } from '@/application/onboardingDrafts';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { OnboardingDraftRepository } from '@/data/onboardingDraftRepository';

export function useOnboardingDraft() {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [repository, setRepository] = useState<OnboardingDraftRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let current = true; openOnboardingDrafts().then(({ repository: nextRepository, initial }) => { if (current) { setRepository(nextRepository); setDraft(initial); } }).catch((reason: unknown) => { if (current) { const detail = reason instanceof Error ? reason.message : 'Unknown storage error'; setError(`Your draft could not be opened. Your saved data has not been deleted. Storage error: ${detail}`); } }); return () => { current = false; }; }, [attempt]);
  const update = useCallback((change: Partial<OnboardingDraft>) => { if (!draft || !repository) return; const next = { ...draft, ...change }; setDraft(next); saveOnboardingDraft(repository, next).catch(() => setError('Your latest change could not be saved.')); }, [draft, repository]);
  return { draft, error, update, retry: () => { setError(null); setAttempt((value) => value + 1); } };
}
