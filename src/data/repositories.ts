import type { ActivityLog, AdjustmentProposal, AuditEvent, Availability, LogicalSession, Plan, PlanRevision, PlanSnapshot, RaceGoal, ReminderRecord, RunnerProfile, SessionAssignment, SessionResolution, UnitSystem } from '@/domain/training/entities';
import type { SqlDatabase } from './database';

export class TrainingRepository {
  public constructor(private readonly database: SqlDatabase, private readonly ownerId: string | null = null) {}

  async saveProfile(profile: RunnerProfile): Promise<void> { await this.database.run(`INSERT OR REPLACE INTO runner_profiles (id,owner_id,units,training_timezone,baseline_json,recent_weekly_volume_value,recent_weekly_volume_unit,baseline_lookback_days,recent_longest_session_seconds,recent_longest_session_date,comfortable_duration_seconds,interruption_status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [profile.id, this.ownerId, profile.units, profile.trainingTimezone, profile.baselineJson, profile.recentWeeklyVolumeValue ?? null, profile.recentWeeklyVolumeUnit ?? null, profile.baselineLookbackDays ?? null, profile.recentLongestSessionSeconds ?? null, profile.recentLongestSessionDate ?? null, profile.comfortableDurationSeconds ?? null, profile.interruptionStatus ?? null, profile.version, profile.createdAt, profile.updatedAt]); }
  async saveGoal(goal: RaceGoal): Promise<void> { await this.database.run(`INSERT OR REPLACE INTO race_goals (id,profile_id,mode,distance_meters,race_date,start_date,version,created_at) VALUES (?,?,?,?,?,?,?,?)`, [goal.id, goal.profileId, goal.mode, goal.distanceMeters, goal.raceDate, goal.startDate, goal.version, goal.createdAt]); }
  async saveAvailability(value: Availability): Promise<void> { await this.database.run(`INSERT OR REPLACE INTO availability (id,profile_id,weekday_limits_json,preferred_long_run_day,exceptions_json,version,created_at) VALUES (?,?,?,?,?,?,?)`, [value.id, value.profileId, value.weekdayLimitsJson, value.preferredLongRunDay, value.exceptionsJson, value.version, value.createdAt]); }
  async savePlan(plan: Plan): Promise<void> { this.assertMode(plan); await this.database.run(`INSERT OR REPLACE INTO plans (id,owner_id,goal_id,template_id,mode,active_revision_id,recommendation_state,validation_fingerprint,created_at) VALUES (?,?,?,?,?,?,?,?,?)`, [plan.id, this.ownerId, plan.goalId, plan.templateId, plan.mode, plan.activeRevisionId, plan.recommendationState, plan.validationFingerprint, plan.createdAt]); }

  async applyRevision(snapshot: PlanSnapshot, event: AuditEvent): Promise<void> {
    this.assertMode(snapshot.plan);
    await this.database.transaction(async () => {
      await this.insertRevision(snapshot.revision);
      for (const assignment of snapshot.assignments) await this.insertAssignment(assignment);
      const updated = await this.database.run('UPDATE plans SET active_revision_id = ?, validation_fingerprint = ?, recommendation_state = ? WHERE id = ?', [snapshot.revision.id, snapshot.revision.inputFingerprint, snapshot.plan.recommendationState, snapshot.plan.id]);
      if (updated.changes !== 1) throw new Error('Cannot activate revision for missing plan');
      await this.saveAuditEvent(event);
    });
  }

  async activateInitialPlan(input: { profile: RunnerProfile; goal: RaceGoal; availability: Availability; snapshot: PlanSnapshot; logicalSessions: LogicalSession[]; event: AuditEvent }): Promise<void> {
    this.assertMode(input.snapshot.plan);
    if (!this.ownerId) throw new Error('An account owner is required to activate a plan.');
    await this.database.transaction(async () => {
      await this.saveProfile(input.profile);
      await this.saveGoal(input.goal);
      await this.saveAvailability(input.availability);
      await this.savePlan(input.snapshot.plan);
      for (const logical of input.logicalSessions) await this.saveLogicalSession(logical);
      await this.insertRevision(input.snapshot.revision);
      for (const assignment of input.snapshot.assignments) await this.insertAssignment(assignment);
      const updated = await this.database.run('UPDATE plans SET active_revision_id = ? WHERE id = ? AND owner_id = ?', [input.snapshot.revision.id, input.snapshot.plan.id, this.ownerId]);
      if (updated.changes !== 1) throw new Error('Cannot activate the new account plan.');
      await this.saveAuditEvent(input.event);
    });
  }

  async saveLogicalSession(value: LogicalSession): Promise<void> { await this.database.run('INSERT INTO logical_sessions (id,plan_id,stable_key,created_at) VALUES (?,?,?,?)', [value.id, value.planId, value.stableKey, value.createdAt]); }
  async saveActivityLog(value: ActivityLog): Promise<void> { await this.database.run('INSERT INTO activity_logs (id,owner_id,previous_version_id,session_id,actual_date,duration_seconds,distance_meters,intended_effort,reported_effort,source,reasons_json,concern_flags_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [value.id, this.ownerId, value.previousVersionId, value.sessionId, value.actualDate, value.durationSeconds, value.distanceMeters, value.intendedEffort, value.reportedEffort, value.source, value.reasonsJson, value.concernFlagsJson, value.createdAt]); }
  async saveResolution(value: SessionResolution): Promise<void> { await this.database.run('INSERT INTO session_resolutions (id,session_id,revision_id,kind,reason,event_id,created_at) VALUES (?,?,?,?,?,?,?)', [value.id, value.sessionId, value.revisionId, value.kind, value.reason, value.eventId, value.createdAt]); }
  async saveProposal(value: AdjustmentProposal): Promise<void> { await this.database.run('INSERT OR REPLACE INTO adjustment_proposals (id,plan_id,base_revision_id,input_fingerprint,reasons_json,diff_json,constraints_json,target_date_effect,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [value.id, value.planId, value.baseRevisionId, value.inputFingerprint, value.reasonsJson, value.diffJson, value.constraintsJson, value.targetDateEffect, value.status, value.createdAt]); }
  async saveAuditEvent(value: AuditEvent): Promise<void> { await this.database.run('INSERT INTO audit_events (id,action_type,related_ids_json,occurred_at) VALUES (?,?,?,?)', [value.id, value.actionType, value.relatedIdsJson, value.occurredAt]); }
  async saveReminder(value: ReminderRecord): Promise<void> { await this.database.run('INSERT OR REPLACE INTO reminder_records (id,owner_id,session_id,revision_id,local_time,timezone,native_notification_id,desired_state,current_state) VALUES (?,?,?,?,?,?,?,?,?)', [value.id, this.ownerId, value.sessionId, value.revisionId, value.localTime, value.timezone, value.nativeNotificationId, value.desiredState, value.currentState]); }
  async saveLocalAccount(value: { id: string; email: string; displayName: string | null; phone: string | null; dateOfBirth: string | null; createdAt: string }): Promise<void> { await this.database.run('INSERT OR REPLACE INTO local_accounts (id, email, display_name, phone, date_of_birth, created_at) VALUES (?, ?, ?, ?, ?, ?)', [value.id, value.email, value.displayName, value.phone, value.dateOfBirth, value.createdAt]); }
  async getLocalAccount(id: string): Promise<{ id: string; email: string; displayName: string | null; phone: string | null; dateOfBirth: string | null } | null> { return this.database.getFirst('SELECT id, email, display_name AS displayName, phone, date_of_birth AS dateOfBirth FROM local_accounts WHERE id = ?', [id]); }
  async getAppSetting(key: string): Promise<string | null> { return (await this.database.getFirst<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]))?.value ?? null; }
  async setAppSetting(key: string, value: string): Promise<void> { await this.database.run('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)', [key, value]); }
  async claimLegacyOwnership(ownerId: string): Promise<void> { await this.database.transaction(async () => { await this.database.run('UPDATE runner_profiles SET owner_id = ? WHERE owner_id IS NULL', [ownerId]); await this.database.run('UPDATE plans SET owner_id = ? WHERE owner_id IS NULL', [ownerId]); await this.database.run('UPDATE activity_logs SET owner_id = ? WHERE owner_id IS NULL', [ownerId]); await this.database.run('UPDATE reminder_records SET owner_id = ? WHERE owner_id IS NULL', [ownerId]); await this.database.run("UPDATE tracking_sessions SET owner_id = ? WHERE owner_id = 'local-device'", [ownerId]); }); }

  async getPlanSnapshot(planId: string): Promise<PlanSnapshot | null> {
    const plan = this.ownerId ? await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE id = ? AND owner_id = ?', [planId, this.ownerId]) : await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE id = ?', [planId]);
    if (!plan?.activeRevisionId) return null;
    const revision = await this.database.getFirst<PlanRevision>('SELECT id, plan_id AS planId, parent_revision_id AS parentRevisionId, engine_version AS engineVersion, template_version AS templateVersion, rule_version AS ruleVersion, input_fingerprint AS inputFingerprint, explanation_json AS explanationJson, created_at AS createdAt FROM plan_revisions WHERE id = ?', [plan.activeRevisionId]);
    if (!revision) throw new Error('Active revision is missing');
    const assignments = await this.database.getAll<SessionAssignment>('SELECT id, logical_session_id AS logicalSessionId, revision_id AS revisionId, planned_date AS plannedDate, phase, role, prescription_json AS prescriptionJson FROM session_assignments WHERE revision_id = ? ORDER BY planned_date, id', [revision.id]);
    return { plan, revision, assignments };
  }

  async getActiveExecution(): Promise<{ snapshot: PlanSnapshot; resolutions: SessionResolution[]; units: UnitSystem } | null> {
    const plan = this.ownerId ? await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE owner_id = ? AND active_revision_id IS NOT NULL ORDER BY created_at DESC LIMIT 1', [this.ownerId]) : await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE active_revision_id IS NOT NULL ORDER BY created_at DESC LIMIT 1');
    if (!plan?.activeRevisionId) return null;
    const snapshot = await this.getPlanSnapshot(plan.id); if (!snapshot) return null;
    const resolutions = await this.database.getAll<SessionResolution>('SELECT id, session_id AS sessionId, revision_id AS revisionId, kind, reason, event_id AS eventId, created_at AS createdAt FROM session_resolutions WHERE revision_id = ?', [snapshot.revision.id]);
    const units = await this.database.getFirst<{ units: UnitSystem }>('SELECT runner_profiles.units AS units FROM runner_profiles JOIN race_goals ON race_goals.profile_id = runner_profiles.id WHERE race_goals.id = ?', [plan.goalId]);
    return { snapshot, resolutions, units: units?.units ?? 'metric' };
  }

  async getActivityHistory(): Promise<ActivityLog[]> { return this.ownerId ? this.database.getAll<ActivityLog>('SELECT id, previous_version_id AS previousVersionId, session_id AS sessionId, actual_date AS actualDate, duration_seconds AS durationSeconds, distance_meters AS distanceMeters, intended_effort AS intendedEffort, reported_effort AS reportedEffort, source, reasons_json AS reasonsJson, concern_flags_json AS concernFlagsJson, created_at AS createdAt FROM activity_logs WHERE owner_id = ? ORDER BY actual_date DESC, created_at DESC', [this.ownerId]) : this.database.getAll<ActivityLog>('SELECT id, previous_version_id AS previousVersionId, session_id AS sessionId, actual_date AS actualDate, duration_seconds AS durationSeconds, distance_meters AS distanceMeters, intended_effort AS intendedEffort, reported_effort AS reportedEffort, source, reasons_json AS reasonsJson, concern_flags_json AS concernFlagsJson, created_at AS createdAt FROM activity_logs ORDER BY actual_date DESC, created_at DESC'); }

  async getReviewInputs(snapshot: PlanSnapshot): Promise<{ profile: RunnerProfile | null; goal: RaceGoal | null; availability: Availability | null; logs: ActivityLog[]; resolutions: SessionResolution[] }> {
    const goal = await this.database.getFirst<RaceGoal>('SELECT id, profile_id AS profileId, mode, distance_meters AS distanceMeters, race_date AS raceDate, start_date AS startDate, version, created_at AS createdAt FROM race_goals WHERE id = ?', [snapshot.plan.goalId]);
    const profile = goal ? await this.database.getFirst<RunnerProfile>('SELECT id, units, training_timezone AS trainingTimezone, baseline_json AS baselineJson, recent_weekly_volume_value AS recentWeeklyVolumeValue, recent_weekly_volume_unit AS recentWeeklyVolumeUnit, baseline_lookback_days AS baselineLookbackDays, recent_longest_session_seconds AS recentLongestSessionSeconds, recent_longest_session_date AS recentLongestSessionDate, comfortable_duration_seconds AS comfortableDurationSeconds, interruption_status AS interruptionStatus, version, created_at AS createdAt, updated_at AS updatedAt FROM runner_profiles WHERE id = ?', [goal.profileId]) : null;
    const availability = goal ? await this.database.getFirst<Availability>('SELECT id, profile_id AS profileId, weekday_limits_json AS weekdayLimitsJson, preferred_long_run_day AS preferredLongRunDay, exceptions_json AS exceptionsJson, version, created_at AS createdAt FROM availability WHERE profile_id = ? ORDER BY version DESC LIMIT 1', [goal.profileId]) : null;
    const sessionIds = new Set(snapshot.assignments.map((item) => item.logicalSessionId));
    const logs = (await this.getActivityHistory()).filter((item) => item.sessionId !== null && sessionIds.has(item.sessionId));
    const resolutions = (await this.database.getAll<SessionResolution>('SELECT id, session_id AS sessionId, revision_id AS revisionId, kind, reason, event_id AS eventId, created_at AS createdAt FROM session_resolutions')).filter((item) => sessionIds.has(item.sessionId));
    return { profile, goal, availability, logs, resolutions };
  }

  async listReminders(): Promise<ReminderRecord[]> { return this.ownerId ? this.database.getAll<ReminderRecord>('SELECT id, session_id AS sessionId, revision_id AS revisionId, local_time AS localTime, timezone, native_notification_id AS nativeNotificationId, desired_state AS desiredState, current_state AS currentState FROM reminder_records WHERE owner_id = ?', [this.ownerId]) : this.database.getAll<ReminderRecord>('SELECT id, session_id AS sessionId, revision_id AS revisionId, local_time AS localTime, timezone, native_notification_id AS nativeNotificationId, desired_state AS desiredState, current_state AS currentState FROM reminder_records'); }
  async replaceReminders(records: ReminderRecord[]): Promise<void> { await this.database.transaction(async () => { if (this.ownerId) await this.database.run('DELETE FROM reminder_records WHERE owner_id = ?', [this.ownerId]); else await this.database.run('DELETE FROM reminder_records'); for (const record of records) await this.saveReminder(record); }); }
  async exportJson(): Promise<string> { const tables = ['runner_profiles', 'race_goals', 'availability', 'plans', 'plan_revisions', 'logical_sessions', 'session_assignments', 'activity_logs', 'session_resolutions', 'adjustment_proposals', 'plan_review_state', 'audit_events', 'reminder_records', 'tracking_sessions', 'tracking_points', 'ai_model_installations', 'ai_conversation_state']; const exported = await Promise.all(tables.map(async (table) => [table, await this.database.getAll<Record<string, unknown>>(`SELECT * FROM ${table}`)] as const)); return JSON.stringify({ schemaVersion: 12, exportedAt: new Date().toISOString(), data: Object.fromEntries(exported) }, null, 2); }
  async deleteAllAppData(): Promise<void> { const tables = ['ai_conversation_state', 'ai_model_installations', 'tracking_points', 'tracking_sessions', 'reminder_records', 'plan_review_state', 'adjustment_proposals', 'session_resolutions', 'activity_logs', 'session_assignments', 'logical_sessions', 'plan_revisions', 'plans', 'availability', 'race_goals', 'runner_profiles', 'onboarding_drafts', 'audit_events']; await this.database.transaction(async () => { for (const table of tables) await this.database.run(`DELETE FROM ${table}`); }); }

  async recordOutcome(input: { planId: string; eventId: string; log: ActivityLog; resolution: SessionResolution; audit: AuditEvent; recommendationState: 'needs_review' | 'health_hold' }): Promise<boolean> {
    const existing = await this.database.getFirst<{ id: string }>('SELECT id FROM session_resolutions WHERE event_id = ?', [input.eventId]);
    if (existing) return false;
    await this.database.transaction(async () => {
      const current = this.ownerId ? await this.database.getFirst<Plan>('SELECT id, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState FROM plans WHERE id = ? AND owner_id = ?', [input.planId, this.ownerId]) : await this.database.getFirst<Plan>('SELECT id, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState FROM plans WHERE id = ?', [input.planId]);
      if (!current || current.activeRevisionId !== input.resolution.revisionId) throw new Error('The plan changed. Refresh the workout before saving.');
      await this.saveActivityLog(input.log);
      await this.saveResolution(input.resolution);
      const state = current.recommendationState === 'health_hold' ? 'health_hold' : input.recommendationState;
      const updated = await this.database.run('UPDATE plans SET recommendation_state = ?, validation_fingerprint = ? WHERE id = ?', [state, `invalidated:${input.eventId}`, input.planId]);
      if (updated.changes !== 1) throw new Error('Cannot invalidate recommendation for missing plan');
      await this.saveAuditEvent(input.audit);
    });
    return true;
  }

  async saveReviewState(value: { planId: string; proposalId: string | null; resultJson: string; inputFingerprint: string; reminderError: string | null; updatedAt: string }): Promise<void> { await this.database.run('INSERT OR REPLACE INTO plan_review_state (plan_id,proposal_id,result_json,input_fingerprint,reminder_error,updated_at) VALUES (?,?,?,?,?,?)', [value.planId, value.proposalId, value.resultJson, value.inputFingerprint, value.reminderError, value.updatedAt]); }
  async getReviewState(planId: string): Promise<{ planId: string; proposalId: string | null; resultJson: string; inputFingerprint: string; reminderError: string | null; updatedAt: string } | null> { return this.database.getFirst('SELECT plan_id AS planId, proposal_id AS proposalId, result_json AS resultJson, input_fingerprint AS inputFingerprint, reminder_error AS reminderError, updated_at AS updatedAt FROM plan_review_state WHERE plan_id = ?', [planId]); }

  async markPlanValidated(input: { planId: string; expectedRevisionId: string; expectedFingerprint: string; validatedFingerprint: string; proposalId: string; event: AuditEvent }): Promise<boolean> {
    await this.database.transaction(async () => {
      const current = this.ownerId ? await this.database.getFirst<Plan>('SELECT id, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint FROM plans WHERE id = ? AND owner_id = ?', [input.planId, this.ownerId]) : await this.database.getFirst<Plan>('SELECT id, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint FROM plans WHERE id = ?', [input.planId]);
      if (!current || current.activeRevisionId !== input.expectedRevisionId || current.validationFingerprint !== input.expectedFingerprint) throw new Error('Review is stale; refresh it before confirming.');
      if (current.recommendationState === 'health_hold') throw new Error('A health hold cannot be cleared by normal reassessment.');
      const updated = this.ownerId ? await this.database.run('UPDATE plans SET validation_fingerprint = ?, recommendation_state = ? WHERE id = ? AND owner_id = ?', [input.validatedFingerprint, 'active', input.planId, this.ownerId]) : await this.database.run('UPDATE plans SET validation_fingerprint = ?, recommendation_state = ? WHERE id = ?', [input.validatedFingerprint, 'active', input.planId]);
      if (updated.changes !== 1) throw new Error('Cannot validate a plan owned by another account.');
      await this.database.run('UPDATE adjustment_proposals SET status = ? WHERE id = ?', ['accepted', input.proposalId]);
      await this.database.run('DELETE FROM plan_review_state WHERE plan_id = ?', [input.planId]);
      await this.saveAuditEvent(input.event);
    });
    return true;
  }

  async applyValidatedRevision(input: { snapshot: PlanSnapshot; expectedRevisionId: string; expectedFingerprint: string; event: AuditEvent; proposalId?: string }): Promise<boolean> {
    this.assertMode(input.snapshot.plan);
    const existing = await this.database.getFirst<PlanRevision>('SELECT id FROM plan_revisions WHERE id = ?', [input.snapshot.revision.id]);
    if (existing) return false;
    await this.database.transaction(async () => {
      const current = this.ownerId ? await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE id = ? AND owner_id = ?', [input.snapshot.plan.id, this.ownerId]) : await this.database.getFirst<Plan>('SELECT id, goal_id AS goalId, template_id AS templateId, mode, active_revision_id AS activeRevisionId, recommendation_state AS recommendationState, validation_fingerprint AS validationFingerprint, created_at AS createdAt FROM plans WHERE id = ?', [input.snapshot.plan.id]);
      if (!current || current.activeRevisionId !== input.expectedRevisionId || current.validationFingerprint !== input.expectedFingerprint) throw new Error('Proposal is stale; refresh the adjustment preview.');
      if (current.recommendationState === 'health_hold') throw new Error('A health hold cannot be cleared by applying a schedule change.');
      await this.insertRevision(input.snapshot.revision);
      for (const assignment of input.snapshot.assignments) await this.insertAssignment(assignment);
      const updated = this.ownerId ? await this.database.run('UPDATE plans SET active_revision_id = ?, validation_fingerprint = ?, recommendation_state = ? WHERE id = ? AND owner_id = ?', [input.snapshot.revision.id, input.snapshot.revision.inputFingerprint, 'active', input.snapshot.plan.id, this.ownerId]) : await this.database.run('UPDATE plans SET active_revision_id = ?, validation_fingerprint = ?, recommendation_state = ? WHERE id = ?', [input.snapshot.revision.id, input.snapshot.revision.inputFingerprint, 'active', input.snapshot.plan.id]);
      if (updated.changes !== 1) throw new Error('Cannot activate revision for missing plan');
      if (input.proposalId) await this.database.run('UPDATE adjustment_proposals SET status = ? WHERE id = ?', ['accepted', input.proposalId]);
      await this.database.run('DELETE FROM plan_review_state WHERE plan_id = ?', [input.snapshot.plan.id]);
      await this.saveAuditEvent(input.event);
    });
    return true;
  }

  private async insertRevision(value: PlanRevision): Promise<void> { await this.database.run('INSERT INTO plan_revisions (id,plan_id,parent_revision_id,engine_version,template_version,rule_version,input_fingerprint,explanation_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [value.id, value.planId, value.parentRevisionId, value.engineVersion, value.templateVersion, value.ruleVersion, value.inputFingerprint, value.explanationJson, value.createdAt]); }
  private async insertAssignment(value: SessionAssignment): Promise<void> { await this.database.run('INSERT INTO session_assignments (id,logical_session_id,revision_id,planned_date,phase,role,prescription_json) VALUES (?,?,?,?,?,?,?)', [value.id, value.logicalSessionId, value.revisionId, value.plannedDate, value.phase, value.role, value.prescriptionJson]); }
  private assertMode(plan: Plan): void { if (plan.mode === 'real' && plan.templateId.startsWith('demo:')) throw new Error('Demo records cannot activate a real plan'); }
}
