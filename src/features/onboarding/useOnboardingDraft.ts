import { useCallback, useEffect, useState } from 'react';
import { openOnboardingDrafts, saveOnboardingDraft } from '@/application/onboardingDrafts';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { OnboardingDraftRepository } from '@/data/onboardingDraftRepository';

export function useOnboardingDraft() {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [repository, setRepository] = useState<OnboardingDraftRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let current = true; openOnboardingDrafts().then(({ repository: nextRepository, initial }) => { if (current) { setRepository(nextRepository); setDraft(initial); } }).catch(() => { if (current) setError('Your draft could not be opened. Try again before continuing.'); }); return () => { current = false; }; }, []);
  const update = useCallback((change: Partial<OnboardingDraft>) => { if (!draft || !repository) return; const next = { ...draft, ...change }; setDraft(next); saveOnboardingDraft(repository, next).catch(() => setError('Your latest change could not be saved.')); }, [draft, repository]);
  return { draft, error, update };
}
