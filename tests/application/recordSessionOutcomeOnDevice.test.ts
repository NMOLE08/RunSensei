import { recordSessionOutcomeOnDevice, type RecordSessionOutcomeInput } from '@/application/recordSessionOutcome';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { Plan } from '@/domain/training/entities';
import { MemoryDatabase } from '../support/memoryDatabase';

const now = '2026-11-28T00:00:00.000Z';
const plan: Plan = { id: 'plan-1', goalId: 'goal-1', templateId: 'reviewed:5k-1', mode: 'real', activeRevisionId: 'revision-1', recommendationState: 'active', validationFingerprint: 'valid', createdAt: now };
const input = (overrides: Partial<RecordSessionOutcomeInput> = {}): RecordSessionOutcomeInput => ({ planId: plan.id, revisionId: 'revision-1', logicalSessionId: 'session-1', actualDate: '2026-11-27', kind: 'different_workout', durationSeconds: 900, distanceMeters: 1234, intendedEffort: 'Easy', reportedEffort: 'Harder than expected', source: 'gps', reasons: [], reviewedConcernFlags: [], idempotencyKey: 'tracked-1', ...overrides });

let mockDatabase: MemoryDatabase;
const mockRefresh = jest.fn(async () => undefined);
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: async () => mockDatabase }));
jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: async () => 'account-a' }));
jest.mock('@/application/reminderRefresh', () => ({ refreshActivePlanReminders: () => mockRefresh() }));

beforeEach(async () => {
  mockDatabase = new MemoryDatabase();
  await migrate(mockDatabase, now);
  await new TrainingRepository(mockDatabase, 'account-a').savePlan(plan);
  mockRefresh.mockClear();
});

it('saves tracked feedback and invalidation without a checkpoint dependency', async () => {
  const result = await recordSessionOutcomeOnDevice(input());

  expect(result.saved).toBe(true);
  expect(result.reminderWarning).toBeNull();
  expect(mockDatabase.table('activity_logs')).toHaveLength(1);
  expect(mockDatabase.table('activity_logs')[0]).toMatchObject({ source: 'gps', duration_seconds: 900, distance_meters: 1234 });
  expect(mockDatabase.table('plans')[0]).toMatchObject({ recommendation_state: 'needs_review', validation_fingerprint: 'invalidated:outcome:session-1:tracked-1' });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('keeps saved tracked feedback when the reminder refresh fails and returns the warning', async () => {
  mockRefresh.mockRejectedValueOnce(new Error('reminders unavailable'));

  const result = await recordSessionOutcomeOnDevice(input({ idempotencyKey: 'tracked-2' }));

  expect(result.saved).toBe(true);
  expect(result.reminderWarning).toBe('Your outcome was saved, but reminders could not be updated yet.');
  expect(mockDatabase.table('activity_logs')).toHaveLength(1);
  expect(mockDatabase.table('session_resolutions')).toHaveLength(1);
});
