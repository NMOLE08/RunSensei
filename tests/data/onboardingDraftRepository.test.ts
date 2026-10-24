import { migrate } from '@/data/migrations';
import { OnboardingDraftRepository } from '@/data/onboardingDraftRepository';
import { emptyDraft } from '@/domain/onboarding/types';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';

it('persists and reopens the current onboarding draft', async () => { const database = new MemoryDatabase(); await migrate(database, '2026-10-24T00:00:00.000Z'); const repository = new OnboardingDraftRepository(database); const draft = { ...emptyDraft('Asia/Kolkata'), weeklyRunningMinutes: '120', updatedAt: '2026-10-24T00:00:00.000Z' }; await repository.save(draft); await expect(new OnboardingDraftRepository(database).load()).resolves.toEqual(draft); });
