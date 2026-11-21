import { HalfMarathonPathwayIntentRepository } from '@/data/halfMarathonPathwayIntentRepository';
import { migrations, migrate } from '@/data/migrations';
import { MemoryDatabase } from '../support/memoryDatabase';

describe('half-marathon pathway intent persistence', () => {
  it('adds an account-scoped, additive migration', async () => {
    const database = new MemoryDatabase();
    await migrate(database, '2027-01-01T00:00:00.000Z');
    expect(migrations.at(-1)?.version).toBe(28);
    expect(database.statements.some((sql) => sql.includes('half_marathon_pathway_intents'))).toBe(true);
  });

  it('persists choices across repository instances and increments revisions', async () => {
    const database = new MemoryDatabase();
    const first = new HalfMarathonPathwayIntentRepository(database, 'account-a');
    expect(await first.get()).toBeNull();
    expect(await first.save('foundation', '2027-01-01T00:00:00.000Z')).toMatchObject({ ownerId: 'account-a', choice: 'foundation', revision: 1, schemaVersion: 1 });
    const reopened = new HalfMarathonPathwayIntentRepository(database, 'account-a');
    expect(await reopened.save('event_preparation', '2027-01-01T00:01:00.000Z')).toMatchObject({ choice: 'event_preparation', revision: 2 });
    expect(await reopened.get()).toMatchObject({ choice: 'event_preparation', revision: 2 });
  });

  it('keeps intent isolated by account', async () => {
    const database = new MemoryDatabase();
    await new HalfMarathonPathwayIntentRepository(database, 'account-a').save('foundation', 'now');
    await new HalfMarathonPathwayIntentRepository(database, 'account-b').save('event_preparation', 'now');
    expect(await new HalfMarathonPathwayIntentRepository(database, 'account-a').get()).toMatchObject({ choice: 'foundation', revision: 1 });
    expect(await new HalfMarathonPathwayIntentRepository(database, 'account-b').get()).toMatchObject({ choice: 'event_preparation', revision: 1 });
  });

  it('keeps the previous committed intent after a failed write', async () => {
    const database = new MemoryDatabase();
    const repository = new HalfMarathonPathwayIntentRepository(database, 'account-a');
    await repository.save('foundation', 'before');
    database.failOn = 'half_marathon_pathway_intents';
    await expect(repository.save('event_preparation', 'after')).rejects.toThrow('Injected failure');
    database.failOn = null;
    expect(await repository.get()).toMatchObject({ choice: 'foundation', revision: 1 });
  });
});
