import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';

export async function saveLocalAccount(value: { id: string; email: string; displayName: string | null; phone: string | null; dateOfBirth: string | null }): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database); const previousOwner = await repository.getAppSetting('active_account_id'); await repository.saveLocalAccount({ ...value, createdAt: new Date().toISOString() }); if (!previousOwner) await repository.claimLegacyOwnership(value.id); await repository.setAppSetting('active_account_id', value.id); }
export async function getLocalAccount(id: string) { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).getLocalAccount(id); }

export async function requireActiveAccountId(): Promise<string> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database); const stored = await repository.getAppSetting('active_account_id'); if (stored) return stored; const { supabase } = await import('@/services/auth/supabase'); const { data } = await supabase.auth.getSession(); const id = data.session?.user.id; if (!id) throw new Error('Sign in before creating or opening a plan.'); await repository.setAppSetting('active_account_id', id); return id; }
