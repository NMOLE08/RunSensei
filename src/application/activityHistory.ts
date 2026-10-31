import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { requireActiveAccountId } from './localAccount';

export async function openActivityHistory() { const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database, ownerId).getActivityHistory(); }
