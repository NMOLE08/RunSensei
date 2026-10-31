import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { requireActiveAccountId } from './localAccount';

export async function openActivePlan() { try { const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database, ownerId).getActiveExecution(); } catch (error) { const message = error instanceof Error ? error.message : 'unknown local storage error'; if (/Sign in/.test(message)) return null; const native = /native module|ExpoSQLite/i.test(message); throw new Error(native ? 'SQLite native support is missing from this build. Rebuild the development app.' : 'Local plan storage could not be opened. Try restarting the app; if it persists, reinstall the development build.'); } }
