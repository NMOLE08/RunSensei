import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';

export async function saveLocalAccount(value: { id: string; email: string; displayName: string | null; phone: string | null; dateOfBirth: string | null }): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); await new TrainingRepository(database).saveLocalAccount({ ...value, createdAt: new Date().toISOString() }); }
export async function getLocalAccount(id: string) { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getLocalAccount(id); }
