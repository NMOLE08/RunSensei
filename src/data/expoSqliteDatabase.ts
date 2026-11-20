import * as SQLite from 'expo-sqlite';
import type { SqlDatabase, SqlResult, SqlValue } from './database';

export class ExpoSqliteDatabase implements SqlDatabase {
  public constructor(private readonly database: SQLite.SQLiteDatabase) {}
  run(sql: string, params: SqlValue[] = []): Promise<SqlResult> { return this.database.runAsync(sql, ...params).then((result) => ({ changes: result.changes, lastInsertRowId: result.lastInsertRowId })); }
  getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> { return this.database.getFirstAsync<T>(sql, ...params); }
  getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> { return this.database.getAllAsync<T>(sql, ...params); }
  async exclusiveTransaction<T>(operation: (database: SqlDatabase) => Promise<T>): Promise<T> {
    let result!: T;
    await this.database.withExclusiveTransactionAsync(async transaction => {
      // Native SQLite waits for another connection's writer without a JS retry loop.
      await transaction.execAsync('PRAGMA busy_timeout = 5000');
      result = await operation(new ExpoSqliteDatabase(transaction));
    });
    return result;
  }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    // A transaction callback is allowed to return void. In particular, repository
    // write operations deliberately return no value after completing their writes.
    // Track whether the callback ran instead of using `undefined` as an error signal.
    let completed = false;
    let result!: T;
    await this.database.withTransactionAsync(async () => {
      result = await operation();
      completed = true;
    });
    if (!completed) throw new Error('Transaction did not run');
    return result;
  }
}

export async function openAppDatabase(name = 'aisensei.db'): Promise<ExpoSqliteDatabase> { return new ExpoSqliteDatabase(await SQLite.openDatabaseAsync(name)); }
