import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';

export async function saveLocalAccount(value: { id: string; email: string; displayName: string | null; phone: string | null; dateOfBirth: string | null }): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database); await repository.saveLocalAccount({ ...value, createdAt: new Date().toISOString() }); await repository.setAppSetting('active_account_id', value.id); }
export async function getLocalAccount(id: string) { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getLocalAccount(id); }

export async function clearActiveAccount(): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); await new TrainingRepository(database).removeAppSetting('active_account_id'); }
export async function getPersistedActiveAccountId(): Promise<string | null> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getAppSetting('active_account_id'); }

export async function purgeLegacyPlaintextSessionTokens(): Promise<void> {
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  await database.run("DELETE FROM app_settings WHERE key LIKE 'supabase:%'");
}

export async function getAuthenticatedAccountId(): Promise<string> {
  const { supabase } = await import('@/services/auth/supabase');
  const { data, error } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (error || !id) throw new Error('Sign in before creating or opening a plan.');
  return id;
}

export async function requireActiveAccountId(): Promise<string> {
  const id = await getAuthenticatedAccountId();
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  await new TrainingRepository(database).setAppSetting('active_account_id', id);
  return id;
}
