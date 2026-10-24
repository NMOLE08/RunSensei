import { openAppDatabase } from './expoSqliteDatabase';
import { migrate } from './migrations';

const key = (value: string) => `supabase:${value}`;
export const supabaseStorage = {
  async getItem(itemKey: string): Promise<string | null> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const row = await database.getFirst<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key(itemKey)]); return row?.value ?? null; },
  async setItem(itemKey: string, value: string): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); await database.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key(itemKey), value]); },
  async removeItem(itemKey: string): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); await database.run('DELETE FROM app_settings WHERE key = ?', [key(itemKey)]); },
};
