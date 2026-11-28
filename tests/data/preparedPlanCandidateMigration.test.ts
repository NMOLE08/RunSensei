import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { migrate, migrations } from '@/data/migrations';
import { MemoryDatabase } from '../support/memoryDatabase';

test('migration 29 adds an additive, owner-scoped prepared-candidate table with one current row per selection', () => {
  const statements = migrations.find((migration) => migration.version === 29)!.statements;
  const script = `import sqlite3, json, sys
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE plans (id TEXT PRIMARY KEY, owner_id TEXT)')
db.execute("INSERT INTO plans VALUES ('existing-plan','account-a')")
for sql in json.loads(sys.stdin.read()): db.execute(sql)

def candidate(id, owner, identity, state):
    db.execute("INSERT INTO prepared_plan_candidates (id,owner_id,goal_family,objective,pathway,identity_key,source_evidence_fingerprint,generated_on,lifecycle_state,payload_json,created_at,superseded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (id,owner,'5k','finish','path-a',identity,'fp','2027-01-01',state,'{}','2027-01-01T00:00:00Z',None))

candidate('one','account-a','selection-a','prepared')
try:
    candidate('duplicate','account-a','selection-a','prepared')
    raise AssertionError('second current candidate accepted')
except sqlite3.IntegrityError: pass
candidate('other-owner','account-b','selection-a','prepared')
candidate('other-selection','account-a','selection-b','prepared')
db.execute("UPDATE prepared_plan_candidates SET lifecycle_state='superseded', superseded_at='2027-01-02T00:00:00Z' WHERE id='one'")
candidate('replacement','account-a','selection-a','prepared')
try:
    db.execute("INSERT INTO prepared_plan_candidates (id,owner_id,goal_family,objective,pathway,identity_key,source_evidence_fingerprint,generated_on,lifecycle_state,payload_json,created_at,superseded_at) VALUES ('bad','account-a','5k','finish','path-a','selection-a','fp','2027-01-01','unknown','{}','now',NULL)")
    raise AssertionError('unknown lifecycle accepted')
except sqlite3.IntegrityError: pass
assert db.execute('SELECT COUNT(*) FROM prepared_plan_candidates WHERE owner_id=? AND lifecycle_state=?',('account-a','prepared')).fetchone()[0]==2
assert db.execute('SELECT id FROM plans').fetchall()==[('existing-plan',)]
print('PASS: prepared candidate migration is additive, scoped and single-current')
`;
  const result = spawnSync('python', ['-c', script], { input: JSON.stringify(statements), encoding: 'utf8' });
  expect({ status: result.status, error: result.stderr }).toEqual({ status: 0, error: '' });
});

test('migration runner records version 29 and creates the prepared-candidate indexes', async () => {
  const database = new MemoryDatabase();
  await migrate(database, '2027-01-01T00:00:00.000Z');
  expect(database.table('schema_migrations').some((row) => row.version === 29)).toBe(true);
  expect(database.statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS prepared_plan_candidates'))).toBe(true);
  expect(database.statements.some((sql) => sql.includes('idx_prepared_plan_candidates_current_identity'))).toBe(true);
  expect(database.statements.some((sql) => sql.includes('idx_prepared_plan_candidates_owner_goal'))).toBe(true);
});

test('real SQLite rejects a second current candidate through the partial unique index', async () => {
  const database = new DatabaseSync(':memory:');
  await migrate({
    run: async (sql, params = []) => { const result = database.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; },
    getFirst: async <T>(sql: string, params: unknown[] = []) => (database.prepare(sql).get(...params) as T) ?? null,
    getAll: async <T>(sql: string, params: unknown[] = []) => database.prepare(sql).all(...params) as T[],
    transaction: async <T>(operation: () => Promise<T>) => { database.exec('BEGIN IMMEDIATE'); try { const value = await operation(); database.exec('COMMIT'); return value; } catch (error) { database.exec('ROLLBACK'); throw error; } },
  } as never, '2027-01-01T00:00:00.000Z');
  const insert = (id: string) => database.prepare('INSERT INTO prepared_plan_candidates (id,owner_id,goal_family,objective,pathway,identity_key,source_evidence_fingerprint,generated_on,lifecycle_state,payload_json,created_at,superseded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 'account-a', '5k', 'finish', 'path-a', 'identity', 'fp', '2027-01-01', 'prepared', '{}', 'now', null);
  insert('first');
  expect(() => insert('second')).toThrow();
  database.close();
});
