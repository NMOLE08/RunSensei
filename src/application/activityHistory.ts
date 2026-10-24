import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';

export async function openActivityHistory() { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getActivityHistory(); }
