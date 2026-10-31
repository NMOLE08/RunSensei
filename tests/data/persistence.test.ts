import { migrate, migrations } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { activatePlanRevision } from '@/application/activatePlanRevision';
import type { ActivityLog, AuditEvent, Plan, PlanRevision, SessionAssignment } from '@/domain/training/entities';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';

const now = '2026-10-24T00:00:00.000Z';
const plan: Plan = { id: 'plan-1', goalId: 'goal-1', templateId: 'reviewed:half-1', mode: 'real', activeRevisionId: null, recommendationState: 'active', validationFingerprint: 'before', createdAt: now };
const revision: PlanRevision = { id: 'revision-1', planId: plan.id, parentRevisionId: null, engineVersion: '1', templateVersion: '1', ruleVersion: '1', inputFingerprint: 'after', explanationJson: '{}', createdAt: now };
const assignment: SessionAssignment = { id: 'assignment-1', logicalSessionId: 'session-1', revisionId: revision.id, plannedDate: '2026-10-25', phase: 'fixture', role: 'easy', prescriptionJson: '{}' };
const audit: AuditEvent = { id: 'event-1', actionType: 'plan_activated', relatedIdsJson: '[]', occurredAt: now };

describe('SQLite persistence boundary', () => {
  it('persists a sample plan and reopens its immutable active revision', async () => {
    const database = new MemoryDatabase(); await migrate(database, now);
    const repository = new TrainingRepository(database); await repository.savePlan(plan); await repository.saveLogicalSession({ id: 'session-1', planId: plan.id, stableKey: 'week-1-easy', createdAt: now });
    await activatePlanRevision(repository, { plan, revision, assignments: [assignment] }, audit);
    const reopened = await new TrainingRepository(database).getPlanSnapshot(plan.id);
    expect(reopened?.revision.id).toBe('revision-1'); expect(reopened?.assignments[0].plannedDate).toBe('2026-10-25'); expect(database.table('schema_migrations')).toHaveLength(migrations.length);
  });

  it('keeps an existing plan through a later migration', async () => {
    const database = new MemoryDatabase(); for (const migration of migrations.filter((value) => value.version < 9)) { for (const statement of migration.statements) await database.run(statement); await database.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [migration.version, now]); } const repository = new TrainingRepository(database); await repository.savePlan(plan); await migrate(database, '2026-10-25T00:00:00.000Z');
    expect(database.table('plans')[0].id).toBe(plan.id);
    expect(database.table('schema_migrations')).toHaveLength(migrations.length);
    expect(database.table('ai_model_installations')).toEqual([]);
    expect(database.table('ai_conversation_state')).toEqual([]);
  });

  it('rolls back a failed revision write without moving the active pointer', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database); await repository.savePlan(plan); await repository.saveLogicalSession({ id: 'session-1', planId: plan.id, stableKey: 'week-1-easy', createdAt: now }); database.failOn = 'session_assignments';
    await expect(activatePlanRevision(repository, { plan, revision, assignments: [assignment] }, audit)).rejects.toThrow('Injected failure');
    expect(database.table('plan_revisions')).toHaveLength(0); expect(database.table('plans')[0].active_revision_id).toBeNull();
  });

  it('preserves missing distance as null and blocks demo content from real mode', async () => {
    const database = new MemoryDatabase(); await migrate(database, now); const repository = new TrainingRepository(database);
    const log: ActivityLog = { id: 'log-1', previousVersionId: null, sessionId: null, actualDate: '2026-10-24', durationSeconds: 1200, distanceMeters: null, intendedEffort: null, reportedEffort: null, source: 'manual', reasonsJson: '[]', concernFlagsJson: '[]', createdAt: now }; await repository.saveActivityLog(log);
    expect(database.table('activity_logs')[0].distance_meters).toBeNull();
    await expect(repository.savePlan({ ...plan, id: 'bad', templateId: 'demo:only', mode: 'real' })).rejects.toThrow('Demo records');
  });
});
