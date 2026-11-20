import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { GuidedCuePreferencesRepository, type GuidedCuePreferences } from '@/data/guidedCuePreferencesRepository';
import { stopGuidedSpeech } from './guidedWorkoutCues';
import { requireActiveAccountId } from './localAccount';

async function owned(ownerId: string) {
  if (!experimental5kPreviewEnabled) throw new Error('Voice guidance is unavailable in this build.');
  if (await requireActiveAccountId() !== ownerId) throw new Error('The signed-in account changed. Reopen voice guidance settings.');
  const db = await openAppDatabase(); await migrate(db, new Date().toISOString());
  return { db, repository: new GuidedCuePreferencesRepository(db, ownerId) };
}

export async function getGuidedCuePreferences(ownerId: string): Promise<GuidedCuePreferences> {
  return (await owned(ownerId)).repository.get();
}

export async function saveGuidedCuePreferences(ownerId: string, value: GuidedCuePreferences, activeSessionId?: string | null): Promise<GuidedCuePreferences> {
  const { db, repository } = await owned(ownerId);
  const saved = await repository.save(value, new Date().toISOString());
  if ((!saved.voiceEnabled || saved.muted) && activeSessionId) await stopGuidedSpeech(db, ownerId, activeSessionId).catch(() => undefined);
  return saved;
}
