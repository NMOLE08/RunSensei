import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { OnboardingDraftRepository } from '@/data/onboardingDraftRepository';
import { emptyDraft, type OnboardingDraft } from '@/domain/onboarding/types';

const isoNow = () => new Date().toISOString();
const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function openOnboardingDrafts(): Promise<{ repository: OnboardingDraftRepository; initial: OnboardingDraft }> {
  const database = await openAppDatabase(); await migrate(database, isoNow()); const repository = new OnboardingDraftRepository(database); return { repository, initial: await repository.load() ?? emptyDraft(deviceTimezone()) };
}

export async function saveOnboardingDraft(repository: OnboardingDraftRepository, draft: OnboardingDraft): Promise<void> { await repository.save({ ...draft, updatedAt: isoNow() }); }
