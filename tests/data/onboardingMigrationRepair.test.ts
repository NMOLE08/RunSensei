import { execFileSync } from 'node:child_process';
import { migrations } from '@/data/migrations';

it('repairs a missing onboarding table without replacing existing data', () => {
  const statements = migrations.find((migration) => migration.version === 10)?.statements;
  expect(statements).toBeDefined();
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE plans (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO plans VALUES (?)').run('existing-plan');
    const statements = JSON.parse(process.argv[1]);
    for (const statement of statements) db.exec(statement);
    db.prepare('INSERT INTO onboarding_drafts VALUES (?, ?, ?)').run('current', '{"goal":"5k"}', 'today');
    for (const statement of statements) db.exec(statement);
    const draft = db.prepare('SELECT payload_json FROM onboarding_drafts WHERE id = ?').get('current');
    const plan = db.prepare('SELECT id FROM plans').get();
    if (draft.payload_json !== '{"goal":"5k"}' || plan.id !== 'existing-plan') process.exit(1);
  `;
  expect(() => execFileSync(process.execPath, ['-e', script, JSON.stringify(statements)], { stdio: 'pipe' })).not.toThrow();
});

it('adds the draft schema version without replacing its JSON payload', () => {
  const statements = migrations.find((migration) => migration.version === 13)?.statements;
  expect(statements).toBeDefined();
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE onboarding_drafts (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
    db.prepare('INSERT INTO onboarding_drafts VALUES (?, ?, ?)').run('current', '{"weeklyRunningMinutes":"120"}', 'today');
    for (const statement of JSON.parse(process.argv[1])) db.exec(statement);
    const row = db.prepare('SELECT payload_json, schema_version FROM onboarding_drafts WHERE id = ?').get('current');
    if (row.payload_json !== '{"weeklyRunningMinutes":"120"}' || row.schema_version !== 1) process.exit(1);
  `;
  expect(() => execFileSync(process.execPath, ['-e', script, JSON.stringify(statements)], { stdio: 'pipe' })).not.toThrow();
});
