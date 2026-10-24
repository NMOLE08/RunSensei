import * as Notifications from 'expo-notifications';
import type { SessionAssignment } from '@/domain/training/entities';
import type { LocalNotifications } from './reconcile';

export const expoLocalNotifications: LocalNotifications = {
  requestPermissionsAsync: async () => { const current = await Notifications.getPermissionsAsync(); return current.granted ? current : Notifications.requestPermissionsAsync(); },
  schedule: async (session: SessionAssignment, timezone: string) => Notifications.scheduleNotificationAsync({ content: { title: 'AiSensei', body: 'A planned session is coming up.', data: { sessionId: session.id, revisionId: session.revisionId, timezone } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: localNineAm(session.plannedDate, timezone) } }),
  cancel: (nativeId) => Notifications.cancelScheduledNotificationAsync(nativeId),
};

function localNineAm(date: string, timezone: string): Date { const target = new Date(`${date}T09:00:00Z`); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(target); const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '9'); target.setUTCHours(target.getUTCHours() + 9 - hour); return target; }
