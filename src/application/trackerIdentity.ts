import * as Crypto from 'expo-crypto';

import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { trackerOnly } from '@/config/productMode';
import { requireActiveAccountId } from './localAccount';

const guestSetting = 'tracker_guest_id';

/** Returns a per-install namespace without claiming or exposing account data. */
export async function getTrackerOwnerId(): Promise<string> {
  if (!trackerOnly) return requireActiveAccountId();
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  const repository = new TrainingRepository(database);
  const existing = await repository.getAppSetting(guestSetting);
  if (existing?.startsWith('guest:')) return existing;
  const created = `guest:${Crypto.randomUUID()}`;
  await repository.setAppSetting(guestSetting, created);
  return created;
}
