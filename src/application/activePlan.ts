import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';

export async function openActivePlan() { try { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getActiveExecution(); } catch (error) { const message = error instanceof Error ? error.message : 'unknown local storage error'; const native = /native module|ExpoSQLite/i.test(message); throw new Error(native ? 'SQLite native support is missing from this build. Rebuild the development app.' : 'Local plan storage could not be opened. Try restarting the app; if it persists, reinstall the development build.'); } }
