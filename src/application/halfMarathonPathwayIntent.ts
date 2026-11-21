import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { HalfMarathonPathwayIntentRepository } from '@/data/halfMarathonPathwayIntentRepository';
import { requireActiveAccountId } from './localAccount';
import type { HalfMarathonPathwayChoice, HalfMarathonPathwayIntent } from '@/domain/planning/halfMarathonPathwayIntent';

async function openRepository() {
  const ownerId = await requireActiveAccountId();
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  return { ownerId, repository: new HalfMarathonPathwayIntentRepository(database, ownerId) };
}

export async function loadCurrentHalfMarathonPathwayIntent(): Promise<HalfMarathonPathwayIntent | null> {
  const { repository } = await openRepository();
  return repository.get();
}

export async function saveCurrentHalfMarathonPathwayIntent(choice: HalfMarathonPathwayChoice): Promise<HalfMarathonPathwayIntent> {
  if (choice !== 'foundation' && choice !== 'event_preparation') throw new Error('unsupported_pathway_choice');
  const current = await openRepository();
  const saved = await current.repository.save(choice, new Date().toISOString());
  if (await requireActiveAccountId() !== current.ownerId) throw new Error('account_changed_while_saving_pathway');
  return saved;
}
