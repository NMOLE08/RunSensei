import { deleteLocalData } from '@/application/dataControls';
import { prepareTrackerForAccountExit } from '@/application/workoutTracker';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { Plan, ReminderRecord } from '@/domain/training/entities';
import type { LocalNotifications } from '@/services/reminders/reconcile';
import { MemoryDatabase } from '../support/memoryDatabase';

const mockOwnerId = 'account-a';
const now = '2026-11-28T00:00:00.000Z';
const plan: Plan = { id: 'plan-a', goalId: 'goal-a', templateId: 'reviewed:5k-1', mode: 'real', activeRevisionId: 'revision-1', recommendationState: 'active', validationFingerprint: 'valid', createdAt: now };
const reminder = (id: string, nativeNotificationId: string | null): ReminderRecord => ({ id, sessionId: `session-${id}`, revisionId: 'revision-1', localTime: '07:00', timezone: 'UTC', nativeNotificationId, desiredState: 'scheduled', currentState: 'scheduled' });

let mockDatabase: MemoryDatabase;
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: async () => mockDatabase }));
jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: async () => mockOwnerId }));
jest.mock('@/application/workoutTracker', () => ({ prepareTrackerForAccountExit: jest.fn(async () => undefined) }));

beforeEach(async () => {
  mockDatabase = new MemoryDatabase();
  await migrate(mockDatabase, now);
  jest.clearAllMocks();
  await new TrainingRepository(mockDatabase, mockOwnerId).savePlan(plan);
  await new TrainingRepository(mockDatabase, mockOwnerId).saveReminder(reminder('reminder-a', 'native-reminder-a'));
  await new TrainingRepository(mockDatabase, 'account-b').savePlan({ ...plan, id: 'plan-b', goalId: 'goal-b' });
  await new TrainingRepository(mockDatabase, 'account-b').saveReminder(reminder('reminder-b', null));
  await new TrainingRepository(mockDatabase, mockOwnerId).setAppSetting('tracker_diagnostics_v2', '[]');
});

afterEach(() => jest.restoreAllMocks());

it('deletes only the signed-in account’s records, cancels its reminders, and removes the obsolete checkpoint setting', async () => {
  const notifications = { cancel: jest.fn(async () => undefined) } as unknown as LocalNotifications;
  const runSpy = jest.spyOn(mockDatabase, 'run');
  jest.spyOn(TrainingRepository.prototype, 'listReminders').mockResolvedValueOnce([reminder('reminder-a', 'native-reminder-a')]);

  await deleteLocalData(notifications);

  expect(prepareTrackerForAccountExit).toHaveBeenCalledWith(mockOwnerId);
  expect(notifications.cancel).toHaveBeenCalledWith('native-reminder-a');
  expect(mockDatabase.table('plans').map((row) => row.id)).toEqual(['plan-b']);
  expect(mockDatabase.table('reminder_records').map((row) => row.id)).toEqual(['reminder-b']);
  expect(runSpy.mock.calls.filter(([sql, params]) => String(sql).includes('DELETE FROM app_settings') && params?.[0] === 'tracker_diagnostics_v2')).toHaveLength(1);
});
