import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { LocalNotifications } from '@/services/reminders/reconcile';
import { clearWorkoutCheckpoints } from '@/application/workoutDiagnostics';
import { requireActiveAccountId } from '@/application/localAccount';
import { prepareTrackerForAccountExit } from '@/application/workoutTracker';

export async function exportLocalData(): Promise<string> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database, await requireActiveAccountId()).exportJson(); }
export async function deleteLocalData(notifications: LocalNotifications): Promise<void> { const ownerId = await requireActiveAccountId(); await prepareTrackerForAccountExit(ownerId); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database, ownerId); const reminders = await repository.listReminders(); for (const reminder of reminders) if (reminder.nativeNotificationId) await notifications.cancel(reminder.nativeNotificationId); await repository.deleteAllAppData(); await clearWorkoutCheckpoints(); }
