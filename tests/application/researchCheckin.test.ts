import { openPendingResearchCheckins, openTrackerHistory } from '@/application/trackerHistory';
import { retainPendingResearchCheckin } from '@/application/researchCheckin';
import { researchWorkoutSkipForNowRoute } from '@/application/researchWorkoutFlow';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { researchBlock, successfulOutcomes } from '../support/researchFoundationFixtures';
import { MemoryDatabase } from '../support/memoryDatabase';
import type { SqlValue } from '@/data/database';

jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn() }));
jest.mock('@/data/migrations', () => ({ migrate: jest.fn() }));
jest.mock('@/application/trackerIdentity', () => ({ getTrackerOwnerId: jest.fn(async () => 'account-a') }));
jest.mock('@/config/experimental5kPreview', () => ({ __esModule: true, experimental5kPreviewEnabled: true }));

class HistoryDatabase extends MemoryDatabase {
  override async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return super.getAll<T>(sql, params);
  }
}
let db: HistoryDatabase;
let block: ReturnType<typeof researchBlock>;
const { openAppDatabase } = jest.requireMock('@/data/expoSqliteDatabase') as { openAppDatabase: jest.Mock };
beforeEach(async () => {
  db = new HistoryDatabase(); block = researchBlock(); openAppDatabase.mockResolvedValue(db);
  const repo = new ResearchFoundationRepository(db, 'account-a'); await repo.saveBlock(block);
  const start = Date.parse('2027-01-05T06:00:00Z');
  await db.run('INSERT INTO tracking_sessions (id, owner_id, planned_session_id, mode, state, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, metric_version, status_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['track-a', 'account-a', null, 'run', 'saved', start, start + 1800000, start + 1800000, JSON.stringify([{ startedAtMs: start, endedAtMs: start + 1800000 }]), 4100, 1, 'gps']);
});

test('a saved GPS activity retains an idempotent, account-owned pending check-in across reload', async () => {
  await db.transaction(() => retainPendingResearchCheckin(db, 'account-a', 'track-a', block.id, block.assignments[0]!.assignmentId, '2027-01-05T06:30:00Z'));
  await db.transaction(() => retainPendingResearchCheckin(db, 'account-a', 'track-a', block.id, block.assignments[0]!.assignmentId, '2027-01-05T06:31:00Z'));
  expect(await openPendingResearchCheckins()).toEqual([{ activityId: 'tracking:track-a', blockId: block.id, assignmentId: block.assignments[0]!.assignmentId, plannedDate: block.assignments[0]!.plannedDate }]);
  const other = new ResearchFoundationRepository(db, 'account-b'); expect(await other.blocks()).toEqual([]);
  expect(JSON.stringify(db.table('tracking_sessions'))).not.toContain(block.id);
});

test('Skip for now offers History while leaving feedback unreported and recoverable', async () => {
  await db.transaction(() => retainPendingResearchCheckin(db, 'account-a', 'track-a', block.id, block.assignments[0]!.assignmentId, '2027-01-05T06:30:00Z'));
  expect(researchWorkoutSkipForNowRoute()).toBe('/(tabs)/history');
  expect((await openTrackerHistory())[0]?.researchFeedback).toBeUndefined();
  expect(await openPendingResearchCheckins()).toHaveLength(1);
  expect(db.table('research_foundation_outcomes')).toHaveLength(0);
});

test('submitting and correcting feedback clears pending state and History shows only the current version', async () => {
  const assignment = block.assignments[0]!; const original = successfulOutcomes(block)[0]!;
  await db.transaction(() => retainPendingResearchCheckin(db, 'account-a', 'track-a', block.id, assignment.assignmentId, '2027-01-05T06:30:00Z'));
  const repo = new ResearchFoundationRepository(db, 'account-a');
  await repo.saveOutcome({ ...original, id: 'feedback-1', associatedActivityId: 'tracking:track-a', record: { ...original.record, actualDate: assignment.plannedDate, actualDurationSeconds: 1800, source: 'gps', durationReliability: 'high' } });
  expect(await openPendingResearchCheckins()).toEqual([]);
  const correction = { ...original, id: 'feedback-2', previousVersionId: 'feedback-1', associatedActivityId: 'tracking:track-a', record: { ...original.record, actualDate: assignment.plannedDate, actualDurationSeconds: 1800, source: 'gps' as const, durationReliability: 'high' as const, difficulty: 'challenging' as const, note: 'Steady effort.' } };
  await repo.saveOutcome(correction);
  const history = await openTrackerHistory();
  expect(history).toHaveLength(1);
  expect(history[0]?.researchFeedback).toMatchObject({ status: 'completed', difficulty: 'challenging', note: 'Steady effort.' });
  expect((await repo.outcomes(block.id))).toHaveLength(2);
  expect(db.table('tracking_sessions')).toHaveLength(1);
});

test('pending check-ins from a different account are not visible', async () => {
  await expect(retainPendingResearchCheckin(db, 'account-b', 'track-a', block.id, block.assignments[0]!.assignmentId, '2027-01-05T06:30:00Z')).rejects.toThrow('research_checkin_activity_not_owned');
  await db.transaction(() => retainPendingResearchCheckin(db, 'account-a', 'track-a', block.id, block.assignments[0]!.assignmentId, '2027-01-05T06:30:00Z'));
  const identity = jest.requireMock('@/application/trackerIdentity') as { getTrackerOwnerId: jest.Mock };
  identity.getTrackerOwnerId.mockResolvedValueOnce('account-b');
  expect(await openPendingResearchCheckins()).toEqual([]);
});
