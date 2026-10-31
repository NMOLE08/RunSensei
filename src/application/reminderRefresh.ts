import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { localDateOnly } from '@/features/execution/viewModel';
import { expoLocalNotifications } from '@/services/reminders/expoNotifications';
import { reconcileReminders } from '@/services/reminders/reconcile';
import { requireActiveAccountId } from './localAccount';

export async function refreshActivePlanReminders(repository?: TrainingRepository): Promise<{ permissionDenied: boolean }> {
  const ownerId = repository ? null : await requireActiveAccountId(); const ownedDatabase = repository ? null : await openAppDatabase(); if (ownedDatabase) await migrate(ownedDatabase, new Date().toISOString()); const activeRepository = repository ?? new TrainingRepository(ownedDatabase!, ownerId);
  const execution = await activeRepository.getActiveExecution(); if (!execution) return { permissionDenied: false };
  const inputs = await activeRepository.getReviewInputs(execution.snapshot); const existing = await activeRepository.listReminders(); const storedPreference = await activeRepository.getAppSetting('reminders_enabled'); const remindersEnabled = storedPreference === 'true' || storedPreference === null && existing.some((record) => record.desiredState === 'scheduled');
  const reconciled = await reconcileReminders(expoLocalNotifications, { remindersEnabled, recommendationState: execution.snapshot.plan.recommendationState, sessions: execution.snapshot.assignments, existing, timezone: inputs.profile?.trainingTimezone ?? 'UTC', today: localDateOnly() });
  await activeRepository.replaceReminders(reconciled.records);
  return { permissionDenied: reconciled.permissionDenied };
}

export async function getRemindersEnabled(): Promise<boolean> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return (await new TrainingRepository(database).getAppSetting('reminders_enabled')) === 'true'; }
export async function setRemindersEnabled(enabled: boolean): Promise<{ permissionDenied: boolean }> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database); await repository.setAppSetting('reminders_enabled', String(enabled)); return refreshActivePlanReminders(repository); }
