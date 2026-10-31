import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { Plan, PlanRevision, SessionAssignment } from '@/domain/training/entities';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';

const at = '2026-10-27T00:00:00.000Z';
const make = (owner: string) => {
  const plan: Plan = { id: `plan-${owner}`, goalId: `goal-${owner}`, templateId: 'demo:5k-completion', mode: 'demo', activeRevisionId: null, recommendationState: 'active', validationFingerprint: owner, createdAt: at };
  const revision: PlanRevision = { id: `revision-${owner}`, planId: plan.id, parentRevisionId: null, engineVersion: '1', templateVersion: '0.3.0-demo', ruleVersion: '0.1.0-demo', inputFingerprint: owner, explanationJson: '{}', createdAt: at };
  const assignment: SessionAssignment = { id: `assignment-${owner}`, logicalSessionId: `logical-${owner}`, revisionId: revision.id, plannedDate: '2026-11-01', phase: 'foundation', role: 'easy', prescriptionJson: '{}' };
  return { plan, revision, assignment };
};

it('returns only the signed-in account active plan', async () => {
  const database = new MemoryDatabase(); await migrate(database, at);
  for (const owner of ['account-a', 'account-b']) {
    const repository = new TrainingRepository(database, owner); const value = make(owner);
    await repository.savePlan(value.plan); await repository.saveLogicalSession({ id: value.assignment.logicalSessionId, planId: value.plan.id, stableKey: 'w1', createdAt: at });
    await repository.applyRevision({ plan: value.plan, revision: value.revision, assignments: [value.assignment] }, { id: `audit-${owner}`, actionType: 'activated', relatedIdsJson: '[]', occurredAt: at });
  }
  expect((await new TrainingRepository(database, 'account-a').getActiveExecution())?.snapshot.plan.id).toBe('plan-account-a');
  expect((await new TrainingRepository(database, 'account-b').getActiveExecution())?.snapshot.plan.id).toBe('plan-account-b');
  expect(await new TrainingRepository(database, 'account-c').getActiveExecution()).toBeNull();
});
