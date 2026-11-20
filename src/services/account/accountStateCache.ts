import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { RemoteOnboardingProgress } from './onboardingProgress';

const key = (ownerId: string) => `account_onboarding_state:${ownerId}`;

export async function cacheOnboardingState(ownerId: string, value: RemoteOnboardingProgress): Promise<void> {
  const db = await openAppDatabase(); await migrate(db, new Date().toISOString());
  await new TrainingRepository(db).setAppSetting(key(ownerId), JSON.stringify(value));
}

export async function readCachedOnboardingState(ownerId: string): Promise<RemoteOnboardingProgress | null> {
  const db = await openAppDatabase(); await migrate(db, new Date().toISOString());
  const raw = await new TrainingRepository(db).getAppSetting(key(ownerId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as RemoteOnboardingProgress;
    return value.status === 'completed' || value.status === 'in_progress' || value.status === 'not_started' ? value : null;
  } catch { return null; }
}
