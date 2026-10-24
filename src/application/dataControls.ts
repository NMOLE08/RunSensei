import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { LocalNotifications } from '@/services/reminders/reconcile';

export async function exportLocalData(): Promise<string> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return new TrainingRepository(database).exportJson(); }
export async function deleteLocalData(notifications: LocalNotifications): Promise<void> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database); const reminders = await repository.listReminders(); for (const reminder of reminders) if (reminder.nativeNotificationId) await notifications.cancel(reminder.nativeNotificationId); await repository.deleteAllAppData(); }
