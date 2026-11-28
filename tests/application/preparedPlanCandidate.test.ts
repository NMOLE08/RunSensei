import { assessFitness } from '@/domain/assessment/assessFitness';
import { migrate } from '@/data/migrations';
import { PreparedPlanCandidateRepository } from '@/data/preparedPlanCandidateRepository';
import { isStoredPreparedPlanPayload, preparedCandidateSelectionFor, resolvePreparedPlanCandidate, type PreparedPlanPayload } from '@/application/preparedPlanCandidate';
import { MemoryDatabase } from '../support/memoryDatabase';
import { activeAuthorizedSnapshot, preparedDraft, preparedFacts, type PreparedGoal } from '../support/preparedPlanFixtures';

const goals: PreparedGoal[] = ['5k', '10k', 'half_marathon', 'marathon'];

async function setup(ownerId = 'account-a') {
  const database = new MemoryDatabase();
  await migrate(database, '2027-01-01T00:00:00.000Z');
  const repository = new PreparedPlanCandidateRepository<PreparedPlanPayload>(database, ownerId);
  return { database, repository };
}

function resolve(facts: Parameters<typeof resolvePreparedPlanCandidate>[0], repository: PreparedPlanCandidateRepository<PreparedPlanPayload>, options: Parameters<typeof resolvePreparedPlanCandidate>[1] = {}) {
  return resolvePreparedPlanCandidate(facts, {
    repository,
    nowDate: '2027-01-01',
    evaluationDate: '2027-01-01',
    createdAt: '2027-01-01T00:00:00.000Z',
    ...options,
  });
}

describe('prepared plan candidate resolution', () => {
  it.each(goals)('persists a fresh, research-only %s candidate', async (goal) => {
    const { database, repository } = await setup();
    const result = await resolve(preparedFacts(goal), repository);
    expect(result.kind).toBe('candidate');
    if (result.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    expect(result.value.candidate.provenance).toMatchObject({ goalFamily: goal, researchOnly: true, productionEligible: false, publicationAuthorized: false, generatedOn: '2027-01-01' });
    expect(result.value.healthHold).toEqual({ active: false, reasonCodes: [] });
    if (result.value.payload.kind === 'experimental_5k') {
      expect(result.value.payload.preview.sessions).toHaveLength(36);
      expect(result.value.payload.preview.productionEligible).toBe(false);
    } else if (result.value.payload.kind === 'event_distance') {
      const candidate = result.value.payload.candidate;
      expect(candidate.kind).toBe('plan');
      expect(candidate.weeks).toHaveLength(goal === '10k' ? 12 : 18);
      expect(candidate.policy.lifecycle).toBe('under_review');
      expect(candidate.policy.releaseAuthorized).toBe(false);
    } else {
      expect(result.value.payload.simulation.weeks).toHaveLength(10);
      expect(result.value.payload.simulation.researchOnly).toBe(true);
      expect(result.value.payload.simulation.productionEligible).toBe(false);
    }
    expect(database.table('prepared_plan_candidates')).toHaveLength(1);
  });

  it.each(goals)('restores the unchanged %s calendar after time passes and the app restarts', async (goal) => {
    const { database, repository } = await setup();
    const first = await resolve(preparedFacts(goal), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');

    const reopened = new PreparedPlanCandidateRepository<PreparedPlanPayload>(database, 'account-a');
    const afterTime = await resolve(preparedFacts(goal), reopened, {
      nowDate: '2028-06-01',
      evaluationDate: '2028-06-01',
      createdAt: '2028-06-01T00:00:00.000Z',
    });
    expect(afterTime).toMatchObject({ kind: 'candidate', value: { candidate: { id: first.value.candidate.id }, payload: first.value.payload } });
    if (afterTime.kind === 'candidate') {
      expect(afterTime.value.candidate.createdAt).toBe(first.value.candidate.createdAt);
      expect(afterTime.value.candidate.provenance.generatedOn).toBe('2027-01-01');
      expect(afterTime.value.staleAgainstCurrentProfile.changed).toBe(false);
    }
  });

  it('shows changed-evidence metadata without hiding the saved calendar', async () => {
    const { repository } = await setup();
    const first = await resolve(preparedFacts('5k'), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    const changedDraft = { ...preparedDraft('5k'), weeklyMinutes: '90' };
    const changed = await resolve(preparedFacts('5k', { draft: changedDraft }), repository, { createdAt: '2027-01-02T00:00:00.000Z' });
    expect(changed.kind).toBe('candidate');
    if (changed.kind !== 'candidate') throw new Error('Expected the saved calendar');
    expect(changed.value.candidate.id).toBe(first.value.candidate.id);
    expect(changed.value.payload).toEqual(first.value.payload);
    expect(changed.value.staleAgainstCurrentProfile).toMatchObject({ changed: true, generatedEvidenceFingerprint: first.value.candidate.provenance.sourceEvidenceFingerprint });
    expect((await repository.list())).toHaveLength(1);
  });

  it.each(goals)('keeps the saved %s calendar visible with typed health-hold metadata', async (goal) => {
    const { database, repository } = await setup();
    const first = await resolve(preparedFacts(goal), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    const before = database.table('prepared_plan_candidates').map((row) => ({ ...row }));
    const healthDraft = { ...preparedDraft(goal), healthConcern: true };
    const healthFacts = preparedFacts(goal, { draft: healthDraft, assessment: assessFitness(healthDraft, '2027-01-01T00:00:00.000Z') });
    const held = await resolve(healthFacts, repository, { createdAt: '2027-01-02T00:00:00.000Z' });
    expect(held).toMatchObject({ kind: 'candidate' });
    if (held.kind !== 'candidate') throw new Error('Expected the saved calendar to remain visible');
    expect(held.value.candidate.id).toBe(first.value.candidate.id);
    expect(held.value.payload).toEqual(first.value.payload);
    expect(held.value.healthHold).toMatchObject({ active: true, reasonCodes: ['health_review_required'] });
    expect((await repository.findCurrent(preparedCandidateSelectionFor(preparedFacts(goal))!))).toMatchObject({ id: first.value.candidate.id });
    expect(database.table('prepared_plan_candidates')).toEqual(before);
  });

  it('never generates or regenerates a calendar while a current health signal exists', async () => {
    const { database, repository } = await setup();
    const healthDraft = { ...preparedDraft('10k'), healthConcern: true };
    const healthFacts = preparedFacts('10k', { draft: healthDraft, assessment: assessFitness(healthDraft, '2027-01-01T00:00:00.000Z') });
    const freshHealth = await resolve(healthFacts, repository);
    expect(freshHealth).toMatchObject({ kind: 'blocked', goalFamily: '10k' });
    if (freshHealth.kind !== 'blocked') throw new Error('Expected a health block');
    expect(freshHealth.reasonCodes.some((code) => code === 'health_review_required' || code === 'assessment_health_hold')).toBe(true);
    expect(await repository.list()).toHaveLength(0);

    const safe = await resolve(preparedFacts('10k'), repository);
    if (safe.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    const healthRegeneration = await resolve(healthFacts, repository, { regenerate: true, createdAt: '2027-01-02T00:00:00.000Z' });
    expect(healthRegeneration).toMatchObject({ kind: 'blocked', goalFamily: '10k' });
    if (healthRegeneration.kind !== 'blocked') throw new Error('Expected a health block');
    expect(healthRegeneration.reasonCodes.some((code) => code === 'health_review_required' || code === 'assessment_health_hold')).toBe(true);
    expect(await repository.findCurrent({ goalFamily: '10k', objective: 'finish', pathway: 'event_distance_conservative' })).toMatchObject({ id: safe.value.candidate.id });
    expect(database.table('prepared_plan_candidates')).toHaveLength(1);
  });

  it('lets an authorized active plan win over any prepared candidate', async () => {
    const { repository } = await setup();
    const active = preparedFacts('5k', { activeSnapshot: activeAuthorizedSnapshot() });
    expect(await resolve(active, repository)).toEqual({ kind: 'active_snapshot' });
    expect(await repository.list()).toHaveLength(0);
  });

  it('isolates goal, objective and foundation pathways', async () => {
    const { repository } = await setup();
    const finish = await resolve(preparedFacts('5k'), repository);
    const performance = await resolve(preparedFacts('5k', { draft: { ...preparedDraft('5k'), trainingObjective: 'improve_performance' } }), repository, { createdAt: '2027-01-02T00:00:00.000Z' });
    const tenK = await resolve(preparedFacts('10k'), repository, { createdAt: '2027-01-03T00:00:00.000Z' });
    expect(finish.kind).toBe('candidate');
    expect(performance.kind).toBe('candidate');
    expect(tenK.kind).toBe('candidate');
    if (finish.kind !== 'candidate' || performance.kind !== 'candidate' || tenK.kind !== 'candidate') throw new Error('Expected three candidates');
    expect(new Set([finish.value.candidate.id, performance.value.candidate.id, tenK.value.candidate.id]).size).toBe(3);
    expect((await repository.list()).map((candidate) => candidate.selection.goalFamily).sort()).toEqual(['10k', '5k', '5k']);

    const foundation = preparedFacts('half_marathon', { pathwayIntent: { ownerId: 'account-a', goal: 'half_marathon', choice: 'foundation', schemaVersion: 1, revision: 1, updatedAt: '2027-01-01T00:00:00.000Z' } });
    expect(preparedCandidateSelectionFor(foundation)).toBeNull();
    expect(await resolve(foundation, repository)).toEqual({ kind: 'not_applicable' });
    expect(await repository.findCurrent({ goalFamily: 'half_marathon', objective: 'finish', pathway: 'event_preparation' })).toBeNull();
  });

  it('regenerates atomically and never reports a failed persistence as success', async () => {
    const { database, repository } = await setup();
    const first = await resolve(preparedFacts('10k'), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');

    database.failOn = 'INSERT INTO prepared_plan_candidates';
    expect(await resolve(preparedFacts('10k'), repository, { regenerate: true, createdAt: '2027-01-02T00:00:00.000Z' })).toMatchObject({ kind: 'blocked', persistenceFailed: true, reasonCodes: ['candidate_persistence_failed'] });
    database.failOn = null;
    expect(await repository.findCurrent({ goalFamily: '10k', objective: 'finish', pathway: 'event_distance_conservative' })).toMatchObject({ id: first.value.candidate.id });

    const changedDraft = { ...preparedDraft('10k'), weeklyMinutes: '180' };
    const regenerated = await resolve(preparedFacts('10k', { draft: changedDraft, assessment: assessFitness(changedDraft, '2027-01-01T00:00:00.000Z') }), repository, { regenerate: true, createdAt: '2027-01-03T00:00:00.000Z' });
    expect(regenerated.kind).toBe('candidate');
    if (regenerated.kind !== 'candidate') throw new Error('Expected regenerated candidate');
    expect(regenerated.value.candidate.id).not.toBe(first.value.candidate.id);
    expect(regenerated.value.staleAgainstCurrentProfile.changed).toBe(false);
    expect(database.table('prepared_plan_candidates')).toHaveLength(2);
    expect(database.table('prepared_plan_candidates').filter((row) => row.lifecycle_state === 'prepared')).toHaveLength(1);
    expect(database.table('prepared_plan_candidates').filter((row) => row.lifecycle_state === 'superseded')).toHaveLength(1);
  });

  it.each(goals)('never persists a fresh %s calendar while health-blocked', async (goal) => {
    const { database, repository } = await setup();
    const healthDraft = { ...preparedDraft(goal), healthConcern: true };
    const healthFacts = preparedFacts(goal, { draft: healthDraft, assessment: assessFitness(healthDraft, '2027-01-01T00:00:00.000Z') });
    const result = await resolve(healthFacts, repository);
    expect(result.kind).toBe('blocked');
    expect(database.table('prepared_plan_candidates')).toHaveLength(0);
  });

  it('fails safely on malformed stored JSON without overwriting the row', async () => {
    const { database, repository } = await setup();
    const first = await resolve(preparedFacts('10k'), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    const row = database.table('prepared_plan_candidates')[0]!;
    const validJson = String(row.payload_json);
    row.payload_json = '{';
    expect(await resolve(preparedFacts('10k'), repository)).toMatchObject({ kind: 'blocked', goalFamily: '10k', reasonCodes: ['prepared_candidate_payload_invalid'] });
    expect(row.payload_json).toBe('{');
    expect(database.table('prepared_plan_candidates')).toHaveLength(1);
    row.payload_json = validJson;
  });

  it('rejects a structurally corrupted stored payload instead of rendering it', async () => {
    const { database, repository } = await setup();
    const first = await resolve(preparedFacts('10k'), repository);
    if (first.kind !== 'candidate') throw new Error('Expected a prepared candidate');
    expect(isStoredPreparedPlanPayload(first.value.payload)).toBe(true);
    const row = database.table('prepared_plan_candidates')[0]!;
    const stored = JSON.parse(String(row.payload_json));
    stored.candidatePayload = { kind: 'event_distance', candidate: { kind: 'plan', goalFamily: '10k' } };
    row.payload_json = JSON.stringify(stored);
    expect(isStoredPreparedPlanPayload({ kind: 'event_distance', candidate: { kind: 'plan', goalFamily: '10k' } })).toBe(false);
    expect(await resolve(preparedFacts('10k'), repository)).toMatchObject({ kind: 'blocked', goalFamily: '10k', reasonCodes: ['prepared_candidate_payload_invalid'] });
    expect(row.payload_json).toBe(JSON.stringify(stored));
    expect((await repository.list())).toHaveLength(1);
  });
});
