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
  { version: 13, statements: [
    `ALTER TABLE onboarding_drafts ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`,
  ] },
  { version: 14, statements: [
    `CREATE TABLE IF NOT EXISTS fitness_assessment_drafts (owner_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS fitness_assessments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, assessment_version TEXT NOT NULL, input_fingerprint TEXT NOT NULL, input_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_fitness_assessments_owner_created ON fitness_assessments(owner_id, created_at)`,
  ] },
  { version: 15, statements: [
    // One immutable assessment fact per account and exact input fingerprint.
    // Different answers intentionally create a later historical assessment.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fitness_assessments_owner_fingerprint ON fitness_assessments(owner_id, input_fingerprint)`,
  ] },
  { version: 16, statements: [
    `CREATE TABLE IF NOT EXISTS research_foundation_blocks (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, identity_key TEXT NOT NULL, parent_block_id TEXT, lifecycle_state TEXT NOT NULL DEFAULT 'saved', payload_json TEXT NOT NULL, UNIQUE(owner_id, identity_key))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_research_single_successor ON research_foundation_blocks(owner_id, parent_block_id) WHERE parent_block_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS research_foundation_outcomes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, block_id TEXT NOT NULL, assignment_id TEXT NOT NULL, previous_id TEXT, activity_id TEXT, payload_json TEXT NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_research_outcome_correction ON research_foundation_outcomes(owner_id, previous_id) WHERE previous_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_research_outcome_first ON research_foundation_outcomes(owner_id, assignment_id) WHERE previous_id IS NULL`,
    `CREATE TABLE IF NOT EXISTS research_foundation_decisions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, block_id TEXT NOT NULL, payload_json TEXT NOT NULL)`,
  ] },
  { version: 17, statements: [
    `CREATE TABLE IF NOT EXISTS research_pending_checkins (owner_id TEXT NOT NULL, activity_id TEXT NOT NULL, block_id TEXT NOT NULL, assignment_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id, activity_id))`,
    `CREATE INDEX IF NOT EXISTS idx_research_pending_owner ON research_pending_checkins(owner_id, created_at)`,
  ] },
  { version: 18, statements: [
    `CREATE TABLE IF NOT EXISTS research_guided_progress (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, block_id TEXT NOT NULL, assignment_id TEXT NOT NULL, tracking_session_id TEXT NOT NULL, snapshot_fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, progress_json TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id, block_id, assignment_id), UNIQUE(owner_id, tracking_session_id))`,
    `CREATE INDEX IF NOT EXISTS idx_research_guided_owner ON research_guided_progress(owner_id, updated_at)`,
  ] },
  { version: 19, statements: [
    `CREATE TABLE IF NOT EXISTS guided_cue_preferences (owner_id TEXT PRIMARY KEY, voice_enabled INTEGER NOT NULL DEFAULT 0, muted INTEGER NOT NULL DEFAULT 0, countdown_enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS guided_cue_events (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, event_id TEXT NOT NULL, kind TEXT NOT NULL, phase_id TEXT, status TEXT NOT NULL CHECK(status IN ('claimed','playback_attempted','playback_completed','playback_failed','suppressed_stale','suppressed_muted','suppressed_disabled','playback_superseded')), claimed_at TEXT NOT NULL, attempted_at TEXT, completed_at TEXT, error_code TEXT, PRIMARY KEY(owner_id, session_id, event_id))`,
    `CREATE INDEX IF NOT EXISTS idx_guided_cue_events_session ON guided_cue_events(owner_id, session_id, claimed_at)`,
  ] },
  { version: 20, statements: [
    `CREATE TABLE IF NOT EXISTS research_weekly_evidence (owner_id TEXT NOT NULL, week_start TEXT NOT NULL, timezone TEXT NOT NULL, coverage TEXT NOT NULL CHECK(coverage IN ('complete','confirmed_no_running','partial','unknown')), confirmation_date TEXT NOT NULL, episode_id TEXT, revision INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(owner_id, week_start, revision))`,
    `CREATE INDEX IF NOT EXISTS idx_research_weekly_evidence_current ON research_weekly_evidence(owner_id, week_start, revision)`,
    `CREATE TABLE IF NOT EXISTS research_training_episodes (owner_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('current','historical','unknown')), started_on TEXT, interruption_date TEXT, reason TEXT, revision INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(owner_id,id,revision))`,
    `CREATE INDEX IF NOT EXISTS idx_research_episode_owner ON research_training_episodes(owner_id, revision)`,
  ] },
  { version: 21, statements: [
    `CREATE TABLE IF NOT EXISTS tracking_metric_edges (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, observation_timestamp_ms INTEGER NOT NULL, processing_timestamp_ms INTEGER NOT NULL, segment INTEGER NOT NULL, distance_increment_meters REAL NOT NULL, cumulative_distance_meters REAL NOT NULL, active_elapsed_ms INTEGER NOT NULL, accuracy_meters REAL NOT NULL, edge_kind TEXT NOT NULL CHECK(edge_kind IN ('anchor','movement','gap')), metric_version INTEGER NOT NULL, UNIQUE(session_id, observation_timestamp_ms))`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_metric_edges_session ON tracking_metric_edges(owner_id, session_id, observation_timestamp_ms)`,
    `CREATE TABLE IF NOT EXISTS tracking_km_splits (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_id TEXT NOT NULL, kilometre INTEGER NOT NULL, crossing_active_ms INTEGER NOT NULL, duration_ms INTEGER NOT NULL, pace_sec_per_km REAL NOT NULL, gps_coverage TEXT NOT NULL CHECK(gps_coverage IN ('continuous','gaps')), metric_version INTEGER NOT NULL, split_version INTEGER NOT NULL, UNIQUE(session_id, kilometre))`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_km_splits_session ON tracking_km_splits(owner_id, session_id, kilometre)`,
    `CREATE TABLE IF NOT EXISTS tracking_gps_state (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, last_received_timestamp_ms INTEGER, last_accepted_timestamp_ms INTEGER, accuracy_meters REAL, quality_state TEXT NOT NULL CHECK(quality_state IN ('acquiring','reliable','degraded','stale','unavailable')), reason_codes_json TEXT NOT NULL DEFAULT '[]', task_error_code TEXT, task_error_count INTEGER NOT NULL DEFAULT 0, accept_until_ms INTEGER, updated_at_ms INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_gps_state_owner ON tracking_gps_state(owner_id, updated_at_ms)`,
  ] },
  { version: 22, statements: [
    `ALTER TABLE tracking_gps_state ADD COLUMN last_valid_observation_timestamp_ms INTEGER`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_metric_edges_active_time ON tracking_metric_edges(owner_id, session_id, active_elapsed_ms)`,
  ] },
  { version: 23, statements: [
    `CREATE TABLE IF NOT EXISTS tracking_active_gps_binding (binding_key TEXT PRIMARY KEY CHECK(binding_key = 'active_gps'), owner_id TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE, generation INTEGER NOT NULL CHECK(generation > 0), lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IN ('recording','draining','paused','finishing','interrupted')), cutoff_ms INTEGER, updated_at_ms INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_active_gps_binding_owner ON tracking_active_gps_binding(owner_id, session_id)`,
  ] },
  { version: 24, statements: [
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN cutoff_token TEXT`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN pipeline_epoch INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN pipeline_started_at_ms INTEGER`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN trusted_anchor_timestamp_ms INTEGER`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN trusted_anchor_latitude REAL`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN trusted_anchor_longitude REAL`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN trusted_anchor_accuracy_meters REAL`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN quarantine_state TEXT NOT NULL DEFAULT 'ready' CHECK(quarantine_state IN ('pending','ready','blocked'))`,
  ] },
  { version: 25, statements: [
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN resume_state TEXT NOT NULL DEFAULT 'confirmed' CHECK(resume_state IN ('confirmed','native_start_pending','recovery_required'))`,
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN resume_distance_meters REAL`,
  ] },
  { version: 26, statements: [
    `ALTER TABLE tracking_active_gps_binding ADD COLUMN account_transition_pending INTEGER NOT NULL DEFAULT 0 CHECK(account_transition_pending IN (0,1))`,
  ] },
  { version: 27, statements: [
    `CREATE TABLE IF NOT EXISTS tracking_gps_diagnostic_sessions (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, summary_json TEXT NOT NULL, updated_at_ms INTEGER NOT NULL, PRIMARY KEY(owner_id, session_id))`,
    `CREATE TABLE IF NOT EXISTS tracking_gps_diagnostic_events (owner_id TEXT NOT NULL, session_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_json TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL, PRIMARY KEY(owner_id, session_id, sequence))`,
    `CREATE INDEX IF NOT EXISTS idx_tracking_gps_diagnostic_events_session ON tracking_gps_diagnostic_events(owner_id, session_id, sequence)`,
  ] },
  { version: 28, statements: [
    `CREATE TABLE IF NOT EXISTS half_marathon_pathway_intents (owner_id TEXT NOT NULL, goal TEXT NOT NULL CHECK(goal = 'half_marathon'), choice TEXT NOT NULL CHECK(choice IN ('foundation','event_preparation')), schema_version INTEGER NOT NULL CHECK(schema_version = 1), revision INTEGER NOT NULL CHECK(revision > 0), updated_at TEXT NOT NULL, PRIMARY KEY(owner_id, goal))`,
  ] },
  { version: 29, statements: [
    `CREATE TABLE IF NOT EXISTS prepared_plan_candidates (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, goal_family TEXT NOT NULL CHECK(goal_family IN ('5k','10k','half_marathon','marathon')), objective TEXT NOT NULL, pathway TEXT NOT NULL, identity_key TEXT NOT NULL, source_evidence_fingerprint TEXT NOT NULL, generated_on TEXT NOT NULL, lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IN ('prepared','superseded')), payload_json TEXT NOT NULL, created_at TEXT NOT NULL, superseded_at TEXT)`,
    // Only one current prepared candidate may exist per account and selection.
    // Superseded rows are retained so a later evidence change never destroys a
    // calendar that was already shown to the runner.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_prepared_plan_candidates_current_identity ON prepared_plan_candidates(owner_id, identity_key) WHERE lifecycle_state = 'prepared'`,
    `CREATE INDEX IF NOT EXISTS idx_prepared_plan_candidates_owner_goal ON prepared_plan_candidates(owner_id, goal_family, lifecycle_state)`,
    `CREATE INDEX IF NOT EXISTS idx_prepared_plan_candidates_owner_created ON prepared_plan_candidates(owner_id, created_at)`,
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
