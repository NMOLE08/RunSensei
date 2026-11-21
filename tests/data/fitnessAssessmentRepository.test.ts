import { createFitnessAssessment, persistAndCreateFitnessAssessment, saveFitnessAssessmentDraft } from '@/application/fitnessAssessmentOnboarding';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { fingerprint } from '@/domain/context';
import { MemoryDatabase } from '../support/memoryDatabase';

const draft = (ownerId: string, weeklyMinutes = '90') => ({ ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Kolkata'), weeklyMinutes, longestSessionMinutes: '30', longestSessionDate: '2026-11-01', comfortableRunMinutes: '25', interruption: 'none' as const, trainingDays: [1, 3, 6], minuteLimits: { 1: '40', 3: '40', 6: '55' } });

it('stores unchanged assessment submissions once, including rapid repeated calls', async () => {
  const db = new MemoryDatabase(); const repository = new FitnessAssessmentRepository(db, 'account-a'); const input = draft('account-a');
  await Promise.all([createFitnessAssessment(repository, input), createFitnessAssessment(repository, input)]);
  expect(db.table('fitness_assessments')).toHaveLength(1);
  expect(db.table('fitness_assessments')[0].input_json).toContain('"interruption":"none"');
});

it('keeps edits as new evidence and isolates identical answers for different accounts', async () => {
  const db = new MemoryDatabase(); const a = new FitnessAssessmentRepository(db, 'account-a'); const b = new FitnessAssessmentRepository(db, 'account-b');
  await createFitnessAssessment(a, draft('account-a'));
  await createFitnessAssessment(a, draft('account-a', '120'));
  await createFitnessAssessment(b, draft('account-b'));
  expect(db.table('fitness_assessments')).toHaveLength(3);
  expect(new Set(db.table('fitness_assessments').map((row) => row.owner_id))).toEqual(new Set(['account-a', 'account-b']));
});

it('keeps schema-8 coaching evidence isolated with its owning account draft', async () => {
  const db = new MemoryDatabase(); const a = new FitnessAssessmentRepository(db, 'account-a'); const b = new FitnessAssessmentRepository(db, 'account-b');
  await saveFitnessAssessmentDraft(a, { ...draft('account-a'), observedWeeklyRunFrequency: 4, runningStyle: 'continuous', preferredTrainingFrequency: 3 });
  await saveFitnessAssessmentDraft(b, { ...draft('account-b'), observedWeeklyRunFrequency: 'variable', runningStyle: 'run_walk', preferredTrainingFrequency: 4 });
  expect(await a.loadDraft()).toMatchObject({ ownerId: 'account-a', observedWeeklyRunFrequency: 4, runningStyle: 'continuous', preferredTrainingFrequency: 3 });
  expect(await b.loadDraft()).toMatchObject({ ownerId: 'account-b', observedWeeklyRunFrequency: 'variable', runningStyle: 'run_walk', preferredTrainingFrequency: 4 });
});

it('resolves the immutable assessment for an exact evidence fingerprint instead of relying on timestamp order', async () => {
  const db = new MemoryDatabase(); const repository = new FitnessAssessmentRepository(db, 'account-a');
  const original = draft('account-a', '90');
  const originalResult = await createFitnessAssessment(repository, original);
  const changedResult = await createFitnessAssessment(repository, { ...original, weeklyMinutes: '180', updatedAt: '2027-01-02T00:00:00.000Z' });
  expect((await repository.latestResult())?.inputFingerprint).toBe(changedResult.inputFingerprint);
  expect((await repository.resultForInputFingerprint(originalResult.inputFingerprint))?.inputFingerprint).toBe(originalResult.inputFingerprint);
});

it('assesses the exact draft that was persisted and remains valid after reopening', async () => {
  const db = new MemoryDatabase(); const repository = new FitnessAssessmentRepository(db, 'account-a');
  const input = { ...draft('account-a'), updatedAt: '2026-11-05T10:00:00.000Z' };
  const saved = await persistAndCreateFitnessAssessment(repository, input);
  const reopened = await repository.loadDraft();
  expect(reopened).toEqual(saved.draft);
  expect(saved.result.inputFingerprint).toBe((await createFitnessAssessment(repository, reopened!)).inputFingerprint);
  expect(db.table('fitness_assessments')).toHaveLength(1);
});

it('preserves newer rapid edits rather than rewriting the draft timestamp during persistence', async () => {
  const db = new MemoryDatabase(); const repository = new FitnessAssessmentRepository(db, 'account-a');
  const first = { ...draft('account-a', '90'), updatedAt: '2026-11-05T10:00:00.000Z' };
  const second = { ...draft('account-a', '120'), updatedAt: '2026-11-05T10:00:01.000Z' };
  await saveFitnessAssessmentDraft(repository, first);
  await saveFitnessAssessmentDraft(repository, second);
  const reopened = await repository.loadDraft();
  expect(reopened).toMatchObject({ weeklyMinutes: '120', updatedAt: second.updatedAt });
  const assessed = await persistAndCreateFitnessAssessment(repository, reopened!);
  expect(assessed.result.inputFingerprint).toBe((await createFitnessAssessment(repository, reopened!)).inputFingerprint);
});

it('allows one safe reassessment of a legacy snapshot without mixing account ownership', async () => {
  const db = new MemoryDatabase(); const a = new FitnessAssessmentRepository(db, 'account-a'); const b = new FitnessAssessmentRepository(db, 'account-b');
  const aDraft = { ...draft('account-a'), updatedAt: '2026-11-05T10:00:00.000Z' };
  const legacy = { ...aDraft, updatedAt: 'older-record-time' };
  await a.saveResult({ ...(await createFitnessAssessment(a, aDraft)), inputFingerprint: fingerprint(legacy), version: 'system-a-v1' }, legacy);
  const current = await persistAndCreateFitnessAssessment(a, aDraft);
  await persistAndCreateFitnessAssessment(b, { ...draft('account-b'), updatedAt: aDraft.updatedAt });
  expect(current.result.version).toBe('system-a-v2');
  expect(db.table('fitness_assessments').filter((row) => row.owner_id === 'account-a')).toHaveLength(2);
  expect(db.table('fitness_assessments').filter((row) => row.owner_id === 'account-b')).toHaveLength(1);
});
