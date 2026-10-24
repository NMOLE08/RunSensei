export type SqlValue = string | number | null;
export interface SqlResult { changes: number; lastInsertRowId: number; }
export interface SqlDatabase {
  run(sql: string, params?: SqlValue[]): Promise<SqlResult>;
  getFirst<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}
