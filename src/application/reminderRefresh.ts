import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { localDateOnly } from '@/features/execution/viewModel';
import { expoLocalNotifications } from '@/services/reminders/expoNotifications';
import { reconcileReminders } from '@/services/reminders/reconcile';
import { requireActiveAccountId } from './localAccount';

export async function refreshActivePlanReminders(repository?: TrainingRepository): Promise<{ permissionDenied: boolean }> {
  const ownerId = await requireActiveAccountId(); const ownedDatabase = repository ? null : await openAppDatabase(); if (ownedDatabase) await migrate(ownedDatabase, new Date().toISOString()); const activeRepository = repository ?? new TrainingRepository(ownedDatabase!, ownerId);
  const execution = await activeRepository.getActiveExecution(); if (!execution) return { permissionDenied: false };
  const inputs = await activeRepository.getReviewInputs(execution.snapshot); const existing = await activeRepository.listReminders(); const storedPreference = await activeRepository.getAppSetting(reminderPreferenceKey(ownerId)); const remindersEnabled = storedPreference === 'true' || storedPreference === null && existing.some((record) => record.desiredState === 'scheduled');
  const reconciled = await reconcileReminders(expoLocalNotifications, { remindersEnabled, recommendationState: execution.snapshot.plan.recommendationState, sessions: execution.snapshot.assignments, existing, timezone: inputs.profile?.trainingTimezone ?? 'UTC', today: localDateOnly() });
  await activeRepository.replaceReminders(reconciled.records);
  return { permissionDenied: reconciled.permissionDenied };
}

const reminderPreferenceKey = (ownerId: string) => `reminders_enabled:${ownerId}`;
export async function getRemindersEnabled(): Promise<boolean> { const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return (await new TrainingRepository(database, ownerId).getAppSetting(reminderPreferenceKey(ownerId))) === 'true'; }
export async function setRemindersEnabled(enabled: boolean): Promise<{ permissionDenied: boolean }> { const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database, ownerId); await repository.setAppSetting(reminderPreferenceKey(ownerId), String(enabled)); return refreshActivePlanReminders(repository); }
