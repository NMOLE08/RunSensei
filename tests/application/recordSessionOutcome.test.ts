import { recordSessionOutcome, type RecordSessionOutcomeInput } from '@/application/recordSessionOutcome';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { Plan } from '@/domain/training/entities';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';

const now = '2026-10-24T00:00:00.000Z';
const plan: Plan = { id: 'plan-1', goalId: 'goal-1', templateId: 'reviewed:half-1', mode: 'real', activeRevisionId: 'revision-1', recommendationState: 'active', validationFingerprint: 'valid', createdAt: now };
const input = (overrides: Partial<RecordSessionOutcomeInput> = {}): RecordSessionOutcomeInput => ({ planId: plan.id, revisionId: 'revision-1', logicalSessionId: 'session-1', actualDate: '2026-10-22', kind: 'partial', durationSeconds: 1200, distanceMeters: null, intendedEffort: 'Easy', reportedEffort: 'Harder than expected', source: 'manual', reasons: ['Warm weather'], reviewedConcernFlags: [], idempotencyKey: 'tap-1', ...overrides });
const context = () => { let count = 0; return { now: () => now, id: (prefix: string) => `${prefix}-${++count}` }; };

describe('recorded activity application boundary', () => {
  it('is idempotent, preserves null measurements, and invalidates the recommendation', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan);
    expect((await recordSessionOutcome(repository, input(), context())).saved).toBe(true);
    expect((await recordSessionOutcome(repository, input(), context())).saved).toBe(false);
    expect(database.table('activity_logs')).toHaveLength(1); expect(database.table('activity_logs')[0].distance_meters).toBeNull(); expect(database.table('plans')[0].recommendation_state).toBe('needs_review'); expect(database.table('plans')[0].validation_fingerprint).toBe('invalidated:outcome:session-1:tap-1'); await repository.savePlan({ ...plan, activeRevisionId: 'revision-2', validationFingerprint: 'replacement' }); expect(database.table('activity_logs')).toHaveLength(1);
  });

  it('records corrections as a version chain and places reviewed concerns on hold', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan); const ids = context();
    const first = await recordSessionOutcome(repository, input({ kind: 'as_planned', durationSeconds: 1800, idempotencyKey: 'first' }), ids);
    await recordSessionOutcome(repository, input({ previousLogId: first.logId, durationSeconds: 1500, reviewedConcernFlags: ['pain_reported'], idempotencyKey: 'correct-1' }), ids);
    expect(database.table('activity_logs')).toHaveLength(2); expect(database.table('activity_logs')[1].previous_version_id).toBe(first.logId); expect(database.table('plans')[0].recommendation_state).toBe('health_hold');
    await recordSessionOutcome(repository, input({ logicalSessionId: 'another-session', idempotencyKey: 'later' }), ids);
    expect(database.table('plans')[0].recommendation_state).toBe('health_hold');
  });

  it('rejects fabricated partial values and leaves a saved log intact if a later proposal write fails', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan);
    await expect(recordSessionOutcome(repository, input({ durationSeconds: null }), context())).rejects.toThrow('Partial work requires');
    await recordSessionOutcome(repository, input({ idempotencyKey: 'saved' }), context()); database.failOn = 'adjustment_proposals';
    await expect(repository.saveProposal({ id: 'proposal-1', planId: plan.id, baseRevisionId: 'revision-1', inputFingerprint: 'x', reasonsJson: '[]', diffJson: '{}', constraintsJson: '{}', targetDateEffect: null, status: 'pending', createdAt: now })).rejects.toThrow('Injected failure');
    expect(database.table('activity_logs')).toHaveLength(1);
  });

  it('rejects an outcome from a stale revision without changing recorded history', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan);
    await expect(recordSessionOutcome(repository, input({ revisionId: 'old-revision' }), context())).rejects.toThrow('plan changed');
    expect(database.table('activity_logs')).toHaveLength(0);
  });

  it('stores GPS actuals separately from the prescription and prevents duplicate feedback', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan);
    const gps = input({ source: 'gps', kind: 'different_workout', durationSeconds: 900, distanceMeters: 1234, idempotencyKey: 'track-123' });
    expect((await recordSessionOutcome(repository, gps, context())).saved).toBe(true);
    expect((await recordSessionOutcome(repository, gps, context())).saved).toBe(false);
    expect(database.table('activity_logs')).toHaveLength(1);
    expect(database.table('activity_logs')[0]).toMatchObject({ source: 'gps', duration_seconds: 900, distance_meters: 1234 });
    expect(database.table('session_resolutions')[0].kind).toBe('different_activity');
  });
});
