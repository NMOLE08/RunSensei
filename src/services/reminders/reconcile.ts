import type { ReminderRecord, SessionAssignment } from '@/domain/training/entities';

export interface LocalNotifications { requestPermissionsAsync(): Promise<{ granted: boolean }>; schedule(session: SessionAssignment, timezone: string): Promise<string>; cancel(nativeId: string): Promise<void>; }
export interface ReminderReconcileInput { remindersEnabled: boolean; recommendationState: 'active' | 'needs_review' | 'health_hold'; sessions: SessionAssignment[]; existing: ReminderRecord[]; timezone: string; today: string; horizonDays?: number; }
export interface ReminderReconcileResult { records: ReminderRecord[]; scheduled: string[]; cancelled: string[]; permissionDenied: boolean; }

export async function reconcileReminders(api: LocalNotifications, input: ReminderReconcileInput): Promise<ReminderReconcileResult> {
  const horizon = input.horizonDays ?? 14; const latest = new Date(`${input.today}T00:00:00Z`); latest.setUTCDate(latest.getUTCDate() + horizon); const desired = input.remindersEnabled && input.recommendationState === 'active' ? input.sessions.filter((session) => { const date = new Date(`${session.plannedDate}T00:00:00Z`); return date >= new Date(`${input.today}T00:00:00Z`) && date <= latest; }) : [];
  if (desired.length > 0 && input.remindersEnabled && input.recommendationState === 'active') { const permission = await api.requestPermissionsAsync(); if (!permission.granted) return { records: input.existing, scheduled: [], cancelled: [], permissionDenied: true }; }
  const desiredKeys = new Set(desired.map((session) => `${session.logicalSessionId}:${session.revisionId}`)); const scheduled: string[] = []; const cancelled: string[] = []; const retained: ReminderRecord[] = [];
  for (const record of input.existing) { const key = `${record.sessionId}:${record.revisionId}`; if (!desiredKeys.has(key) || record.timezone !== input.timezone || record.currentState !== 'scheduled') { if (record.nativeNotificationId) await api.cancel(record.nativeNotificationId); cancelled.push(record.id); retained.push({ ...record, desiredState: 'cancelled', currentState: 'cancelled', nativeNotificationId: null }); } else retained.push(record); }
  const existingKeys = new Set(retained.filter((record) => record.currentState === 'scheduled').map((record) => `${record.sessionId}:${record.revisionId}`));
  for (const session of desired) { const key = `${session.logicalSessionId}:${session.revisionId}`; if (existingKeys.has(key)) continue; const nativeNotificationId = await api.schedule(session, input.timezone); const id = `reminder:${session.logicalSessionId}:${session.revisionId}`; retained.push({ id, sessionId: session.logicalSessionId, revisionId: session.revisionId, localTime: '09:00', timezone: input.timezone, nativeNotificationId, desiredState: 'scheduled', currentState: 'scheduled' }); scheduled.push(id); }
  return { records: retained, scheduled, cancelled, permissionDenied: false };
}
