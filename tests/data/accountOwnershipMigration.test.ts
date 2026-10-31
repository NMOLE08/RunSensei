import { execFileSync } from 'node:child_process';
import { migrations } from '@/data/migrations';

it('adds account ownership without deleting existing plans or activity', () => {
  const statements = migrations.find((migration) => migration.version === 11)?.statements;
  expect(statements).toBeDefined();
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE runner_profiles (id TEXT PRIMARY KEY); CREATE TABLE plans (id TEXT PRIMARY KEY, active_revision_id TEXT); CREATE TABLE activity_logs (id TEXT PRIMARY KEY, actual_date TEXT); CREATE TABLE reminder_records (id TEXT PRIMARY KEY);');
    db.exec("INSERT INTO plans VALUES ('legacy-plan','legacy-revision'); INSERT INTO activity_logs VALUES ('legacy-log','2026-10-26');");
    for (const statement of JSON.parse(process.argv[1])) db.exec(statement);
    const plan = db.prepare('SELECT id, owner_id FROM plans').get();
    const log = db.prepare('SELECT id, owner_id FROM activity_logs').get();
    if (plan.id !== 'legacy-plan' || plan.owner_id !== null || log.id !== 'legacy-log' || log.owner_id !== null) process.exit(1);
  `;
  expect(() => execFileSync(process.execPath, ['-e', script, JSON.stringify(statements)], { stdio: 'pipe' })).not.toThrow();
});
