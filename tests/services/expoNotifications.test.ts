import { reminderNotificationContent } from '@/services/reminders/expoNotifications';

jest.mock('expo-notifications', () => ({ SchedulableTriggerInputTypes: { DATE: 'date' } }));

describe('reminder notification presentation', () => {
  it('uses the Torto title while retaining the existing session identity payload', () => {
    const session = { id: 'session-a', revisionId: 'revision-a', plannedDate: '2026-11-20' } as never;
    expect(reminderNotificationContent(session, 'Asia/Kolkata')).toEqual({
      title: 'Torto', body: 'A planned session is coming up.', data: { sessionId: 'session-a', revisionId: 'revision-a', timezone: 'Asia/Kolkata' },
    });
  });
});
