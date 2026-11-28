import { PreparedPlanCandidateRepository } from '@/data/preparedPlanCandidateRepository';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { PreparedPlanCandidateProvenance, PreparedPlanCandidateSelection } from '@/domain/planning/preparedPlanCandidate';
import { MemoryDatabase } from '../support/memoryDatabase';

type Payload = { kind: string; week: number };

const selection: PreparedPlanCandidateSelection = { goalFamily: '5k', objective: 'finish', pathway: 'path-a' };

function provenance(overrides: Partial<PreparedPlanCandidateProvenance> = {}): PreparedPlanCandidateProvenance {
  return {
    goalFamily: '5k',
    objective: 'finish',
    pathway: 'path-a',
    policyId: 'policy-a',
    policyVersion: '1.0.0',
    sourceEvidenceFingerprint: 'fp-1',
    generatedOn: '2027-01-01',
    startDate: '2027-01-04',
    eventDate: '2027-03-22',
    pathwayIntentRevision: 3,
    researchOnly: true,
    productionEligible: false,
    publicationAuthorized: false,
    ...overrides,
  };
}

async function database() {
  const db = new MemoryDatabase();
  await migrate(db, '2027-01-01T00:00:00.000Z');
  return db;
}

describe('prepared plan candidate repository', () => {
  it('restores an unchanged calendar across repository instances, accounts and selections', async () => {
    const db = await database();
    const ownerA = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    const saved = await ownerA.save({ id: 'candidate-1', selection, provenance: provenance(), payload: { kind: 'calendar', week: 1 }, createdAt: '2027-01-01T00:00:00.000Z' });

    const reopened = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    expect(await reopened.findCurrent(selection)).toEqual(saved);
    expect(saved).toMatchObject({ provenance: { researchOnly: true, productionEligible: false, publicationAuthorized: false, pathwayIntentRevision: 3 } });
    expect(await new PreparedPlanCandidateRepository<Payload>(db, 'account-b').findCurrent(selection)).toBeNull();
    expect(await reopened.findCurrent({ ...selection, objective: 'improve_performance' })).toBeNull();
    expect(await reopened.findCurrent({ ...selection, pathway: 'path-b' })).toBeNull();
    expect(await reopened.findCurrent({ ...selection, goalFamily: '10k' })).toBeNull();
  });

  it('is idempotent for the same evidence and payload, and supersedes only on a real change', async () => {
    const db = await database();
    const repository = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    const input = { id: 'candidate-1', selection, provenance: provenance(), payload: { kind: 'calendar', week: 1 }, createdAt: '2027-01-01T00:00:00.000Z' };
    await repository.save(input);
    await repository.save({ ...input, id: 'duplicate-id', createdAt: '2027-01-02T00:00:00.000Z' });
    expect(db.table('prepared_plan_candidates')).toHaveLength(1);

    await repository.save({ ...input, id: 'candidate-2', payload: { kind: 'calendar', week: 2 }, createdAt: '2027-01-03T00:00:00.000Z' });
    expect(db.table('prepared_plan_candidates')).toHaveLength(2);
    expect(db.table('prepared_plan_candidates').filter((row) => row.lifecycle_state === 'prepared')).toHaveLength(1);
    expect(await repository.findCurrent(selection)).toMatchObject({ id: 'candidate-2', payload: { week: 2 } });
  });

  it('rejects a delayed write and keeps the newer calendar current', async () => {
    const db = await database();
    const repository = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    await repository.save({ id: 'newer', selection, provenance: provenance({ sourceEvidenceFingerprint: 'fp-2' }), payload: { kind: 'calendar', week: 2 }, createdAt: '2027-01-02T00:00:00.000Z' });
    await expect(repository.save({ id: 'older', selection, provenance: provenance({ sourceEvidenceFingerprint: 'fp-1' }), payload: { kind: 'calendar', week: 1 }, createdAt: '2027-01-01T00:00:00.000Z' })).rejects.toThrow('prepared_candidate_stale');
    expect(await repository.findCurrent(selection)).toMatchObject({ id: 'newer' });
    expect((await repository.list()).map((candidate) => candidate.id)).toEqual(['newer']);
  });

  it('serializes concurrent writers and rolls back an interrupted supersede', async () => {
    const db = await database();
    const first = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    const second = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    const base = { selection, provenance: provenance() };
    await first.save({ ...base, id: 'base', payload: { kind: 'calendar', week: 0 }, createdAt: '2026-12-31T00:00:00.000Z' });

    db.failOn = 'INSERT INTO prepared_plan_candidates';
    await expect(second.save({ ...base, id: 'broken', payload: { kind: 'calendar', week: 3 }, createdAt: '2027-01-04T00:00:00.000Z' })).rejects.toThrow('Injected failure');
    db.failOn = null;
    expect(await first.findCurrent(selection)).toMatchObject({ id: 'base' });

    const results = await Promise.allSettled([
      first.save({ ...base, id: 'later', payload: { kind: 'calendar', week: 5 }, createdAt: '2027-01-05T00:00:00.000Z' }),
      second.save({ ...base, id: 'earlier', payload: { kind: 'calendar', week: 4 }, createdAt: '2027-01-04T00:00:00.000Z' }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(await first.findCurrent(selection)).toMatchObject({ id: 'later', payload: { week: 5 } });
    expect(db.table('prepared_plan_candidates').filter((row) => row.lifecycle_state === 'prepared')).toHaveLength(1);
  });

  it('stores and deletes only the owner’s candidates', async () => {
    const db = await database();
    await new PreparedPlanCandidateRepository<Payload>(db, 'account-a').save({ id: 'owned', selection, provenance: provenance(), payload: { kind: 'calendar', week: 1 }, createdAt: 'now' });
    await new PreparedPlanCandidateRepository<Payload>(db, 'account-b').save({ id: 'other', selection, provenance: provenance({ goalFamily: '5k' }), payload: { kind: 'calendar', week: 1 }, createdAt: 'now' });

    expect(db.table('prepared_plan_candidates').filter((row) => row.owner_id === 'account-a').map((row) => row.id)).toEqual(['owned']);
    expect(db.table('prepared_plan_candidates').filter((row) => row.owner_id === 'account-b').map((row) => row.id)).toEqual(['other']);

    await new TrainingRepository(db, 'account-a').deleteAllAppData();
    expect(db.table('prepared_plan_candidates').map((row) => row.id)).toEqual(['other']);
  });

  it('never trusts a stored flag that promotes a candidate toward production', async () => {
    const db = await database();
    const repository = new PreparedPlanCandidateRepository<Payload>(db, 'account-a');
    await repository.save({ id: 'candidate', selection, provenance: provenance(), payload: { kind: 'calendar', week: 1 }, createdAt: 'now' });
    const row = db.table('prepared_plan_candidates')[0]!;
    const stored = JSON.parse(String(row.payload_json));
    stored.provenance.researchOnly = false;
    stored.provenance.productionEligible = true;
    stored.provenance.publicationAuthorized = true;
    row.payload_json = JSON.stringify(stored);
    expect(await repository.findCurrent(selection)).toMatchObject({ provenance: { researchOnly: true, productionEligible: false, publicationAuthorized: false } });
  });
});
