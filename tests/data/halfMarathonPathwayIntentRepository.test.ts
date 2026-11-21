import { HalfMarathonPathwayIntentRepository } from '@/data/halfMarathonPathwayIntentRepository';
import type { SqlDatabase, SqlResult, SqlValue } from '@/data/database';
import { migrations, migrate } from '@/data/migrations';
import { MemoryDatabase } from '../support/memoryDatabase';

/** Models Expo SQLite's distinct exclusive-transaction connection. */
class SeparateTransactionDatabase implements SqlDatabase {
  private readonly stored = new MemoryDatabase();
  private exclusiveActive = false;
  public readonly outerCalls: string[] = [];
  public readonly transactionCalls: string[] = [];
  public failCommit = false;
  public failTransactionWrite = false;

  async run(sql: string, params: SqlValue[] = []): Promise<SqlResult> { this.outerCalls.push(sql); if (this.exclusiveActive) throw new Error('outer_connection_used_inside_exclusive_transaction'); return this.stored.run(sql, params); }
  async getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> { this.outerCalls.push(sql); if (this.exclusiveActive) throw new Error('outer_connection_used_inside_exclusive_transaction'); return this.stored.getFirst<T>(sql, params); }
  async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> { this.outerCalls.push(sql); if (this.exclusiveActive) throw new Error('outer_connection_used_inside_exclusive_transaction'); return this.stored.getAll<T>(sql, params); }
  transaction<T>(operation: () => Promise<T>): Promise<T> { return this.stored.transaction(operation); }
  async exclusiveTransaction<T>(operation: (database: SqlDatabase) => Promise<T>): Promise<T> {
    this.exclusiveActive = true;
    const transaction: SqlDatabase = {
      run: async (sql, params = []) => { this.transactionCalls.push(sql); if (this.failTransactionWrite && sql.includes('half_marathon_pathway_intents')) throw new Error('injected_transaction_write_failure'); return this.stored.run(sql, params); },
      getFirst: async <R>(sql: string, params: SqlValue[] = []) => { this.transactionCalls.push(sql); return this.stored.getFirst<R>(sql, params); },
      getAll: async <R>(sql: string, params: SqlValue[] = []) => { this.transactionCalls.push(sql); return this.stored.getAll<R>(sql, params); },
      transaction: (callback) => this.stored.transaction(callback),
    };
    try {
      return await this.stored.transaction(async () => {
        const result = await operation(transaction);
        if (this.failCommit) throw new Error('injected_exclusive_commit_failure');
        return result;
      });
    } finally { this.exclusiveActive = false; }
  }
}

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

  it('uses only the exclusive transaction connection and rolls back a failed commit', async () => {
    const database = new SeparateTransactionDatabase();
    const repository = new HalfMarathonPathwayIntentRepository(database, 'account-a');
    await repository.save('foundation', 'before');
    expect(database.outerCalls).toEqual([]);
    expect(database.transactionCalls).toHaveLength(3);

    database.failCommit = true;
    await expect(repository.save('event_preparation', 'after')).rejects.toThrow('injected_exclusive_commit_failure');
    database.failCommit = false;
    expect(await repository.get()).toMatchObject({ choice: 'foundation', revision: 1 });
  });

  it('rolls back an intermediate transaction failure and rejects a stale expected revision', async () => {
    const database = new SeparateTransactionDatabase();
    const repository = new HalfMarathonPathwayIntentRepository(database, 'account-a');
    await repository.save('foundation', 'before');
    database.failTransactionWrite = true;
    await expect(repository.save('event_preparation', 'after', 1)).rejects.toThrow('injected_transaction_write_failure');
    database.failTransactionWrite = false;
    expect(await repository.get()).toMatchObject({ choice: 'foundation', revision: 1 });

    await expect(repository.save('event_preparation', 'after', 1)).resolves.toMatchObject({ choice: 'event_preparation', revision: 2 });
    await expect(repository.save('foundation', 'stale', 1)).rejects.toThrow('pathway_intent_revision_conflict');
    expect(await repository.get()).toMatchObject({ choice: 'event_preparation', revision: 2 });
  });
});
