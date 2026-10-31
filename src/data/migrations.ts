import type { SqlDatabase } from './database';

const schema = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runner_profiles (id TEXT PRIMARY KEY, units TEXT NOT NULL, training_timezone TEXT NOT NULL, baseline_json TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS race_goals (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, mode TEXT NOT NULL, distance_meters INTEGER NOT NULL, race_date TEXT, start_date TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS availability (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, weekday_limits_json TEXT NOT NULL, preferred_long_run_day INTEGER, exceptions_json TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, template_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('demo','real')), active_revision_id TEXT, recommendation_state TEXT NOT NULL, validation_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plan_revisions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, parent_revision_id TEXT, engine_version TEXT NOT NULL, template_version TEXT NOT NULL, rule_version TEXT NOT NULL, input_fingerprint TEXT NOT NULL, explanation_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS logical_sessions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, stable_key TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(plan_id, stable_key))`,
  `CREATE TABLE IF NOT EXISTS session_assignments (id TEXT PRIMARY KEY, logical_session_id TEXT NOT NULL, revision_id TEXT NOT NULL, planned_date TEXT NOT NULL, phase TEXT NOT NULL, role TEXT NOT NULL, prescription_json TEXT NOT NULL, UNIQUE(revision_id, logical_session_id))`,
  `CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, previous_version_id TEXT, session_id TEXT, actual_date TEXT NOT NULL, duration_seconds INTEGER, distance_meters INTEGER, effort TEXT, source TEXT NOT NULL, concern_flags_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS session_resolutions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, revision_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT, event_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS adjustment_proposals (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, base_revision_id TEXT NOT NULL, input_fingerprint TEXT NOT NULL, reasons_json TEXT NOT NULL, diff_json TEXT NOT NULL, constraints_json TEXT NOT NULL, target_date_effect TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, action_type TEXT NOT NULL, related_ids_json TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminder_records (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, revision_id TEXT NOT NULL, local_time TEXT NOT NULL, timezone TEXT NOT NULL, native_notification_id TEXT, desired_state TEXT NOT NULL, current_state TEXT NOT NULL)`,
];

export const migrations = [
  { version: 1, statements: schema },
  { version: 2, statements: [`CREATE INDEX IF NOT EXISTS idx_activity_logs_session ON activity_logs(session_id)`, `CREATE INDEX IF NOT EXISTS idx_assignments_revision_date ON session_assignments(revision_id, planned_date)`] },
  { version: 3, statements: [`CREATE TABLE IF NOT EXISTS onboarding_drafts (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`] },
  { version: 4, statements: [`ALTER TABLE activity_logs ADD COLUMN intended_effort TEXT`, `ALTER TABLE activity_logs ADD COLUMN reported_effort TEXT`, `ALTER TABLE activity_logs ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]'`, `CREATE INDEX IF NOT EXISTS idx_resolutions_event ON session_resolutions(event_id)`] },
  { version: 5, statements: [`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`] },
  { version: 6, statements: [`CREATE TABLE IF NOT EXISTS local_accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT, created_at TEXT NOT NULL)`] },
  { version: 7, statements: [`ALTER TABLE local_accounts ADD COLUMN phone TEXT`, `ALTER TABLE local_accounts ADD COLUMN date_of_birth TEXT`] },
  { version: 8, statements: [
    `ALTER TABLE runner_profiles ADD COLUMN recent_weekly_volume_value INTEGER`,
    `ALTER TABLE runner_profiles ADD COLUMN recent_weekly_volume_unit TEXT`,
    `ALTER TABLE runner_profiles ADD COLUMN baseline_lookback_days INTEGER`,
    `ALTER TABLE runner_profiles ADD COLUMN recent_longest_session_seconds INTEGER`,
    `ALTER TABLE runner_profiles ADD COLUMN recent_longest_session_date TEXT`,
    `ALTER TABLE runner_profiles ADD COLUMN comfortable_duration_seconds INTEGER`,
    `ALTER TABLE runner_profiles ADD COLUMN interruption_status TEXT`,
    `CREATE TABLE IF NOT EXISTS plan_review_state (plan_id TEXT PRIMARY KEY, proposal_id TEXT, result_json TEXT NOT NULL, input_fingerprint TEXT NOT NULL, reminder_error TEXT, updated_at TEXT NOT NULL)`,
  ] },
  { version: 9, statements: [
    `CREATE TABLE IF NOT EXISTS tracking_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, planned_session_id TEXT, revision_id TEXT, prescription_json TEXT, mode TEXT NOT NULL, state TEXT NOT NULL, started_at_ms INTEGER, ended_at_ms INTEGER, checkpoint_at_ms INTEGER NOT NULL, segments_json TEXT NOT NULL, distance_meters REAL, metric_version INTEGER NOT NULL, feedback_json TEXT, status_reason TEXT)`,
    `CREATE TABLE IF NOT EXISTS tracking_points (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy_meters REAL NOT NULL, segment INTEGER NOT NULL, UNIQUE(session_id, timestamp_ms))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_tracker ON tracking_sessions ((1)) WHERE state IN ('preparing','recording','paused','finishing','interrupted')`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_owner ON tracking_sessions(owner_id, started_at_ms)`,
  ] },
  // Repair installations whose migration history already includes version 3
  // but whose onboarding table is missing. Never replace an existing draft.
  { version: 10, statements: [`CREATE TABLE IF NOT EXISTS onboarding_drafts (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL)`] },
  { version: 11, statements: [
    `ALTER TABLE runner_profiles ADD COLUMN owner_id TEXT`,
    `ALTER TABLE plans ADD COLUMN owner_id TEXT`,
    `ALTER TABLE activity_logs ADD COLUMN owner_id TEXT`,
    `ALTER TABLE reminder_records ADD COLUMN owner_id TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_plans_owner_active ON plans(owner_id, active_revision_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_owner_date ON activity_logs(owner_id, actual_date)`,
    `CREATE INDEX IF NOT EXISTS idx_reminders_owner ON reminder_records(owner_id)`,
  ] },
  { version: 12, statements: [
    `CREATE TABLE IF NOT EXISTS ai_model_installations (model_id TEXT PRIMARY KEY, version TEXT NOT NULL, sha256 TEXT NOT NULL, byte_size INTEGER NOT NULL, local_path TEXT, state TEXT NOT NULL, verified_at TEXT, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ai_conversation_state (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, state_json TEXT NOT NULL, model_id TEXT NOT NULL, prompt_version TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_conversation_owner ON ai_conversation_state(owner_id, updated_at)`,
  ] },
];

let migrationQueue: Promise<void> = Promise.resolve();

export async function migrate(database: SqlDatabase, appliedAt: string): Promise<void> {
  const task = migrationQueue.then(async () => {
    await database.run(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
    for (const migration of migrations) {
      const applied = await database.getFirst<{ version: number }>('SELECT version FROM schema_migrations WHERE version = ?', [migration.version]);
      if (applied) continue;
      await database.transaction(async () => { for (const statement of migration.statements) await database.run(statement); await database.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [migration.version, appliedAt]); });
    }
  });
  migrationQueue = task.catch(() => undefined);
  return task;
}
