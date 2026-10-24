import * as SQLite from 'expo-sqlite';
import type { SqlDatabase, SqlResult, SqlValue } from './database';

export class ExpoSqliteDatabase implements SqlDatabase {
  public constructor(private readonly database: SQLite.SQLiteDatabase) {}
  run(sql: string, params: SqlValue[] = []): Promise<SqlResult> { return this.database.runAsync(sql, ...params).then((result) => ({ changes: result.changes, lastInsertRowId: result.lastInsertRowId })); }
  getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> { return this.database.getFirstAsync<T>(sql, ...params); }
  getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> { return this.database.getAllAsync<T>(sql, ...params); }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    let result: T | undefined;
    await this.database.withTransactionAsync(async () => { result = await operation(); });
    if (result === undefined) throw new Error('Transaction completed without a result');
    return result;
  }
}

export async function openAppDatabase(name = 'aisensei.db'): Promise<ExpoSqliteDatabase> { return new ExpoSqliteDatabase(await SQLite.openDatabaseAsync(name)); }
