import data from '../../../PolicyPack/foundation/01_current_running_week_v0.1.0_draft.json';
import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { schedulePolicyWeek, type ScheduledPolicyWorkout, type MultiDistanceRunnerConstraints, type MultiDistanceTrainingPolicy, type PolicyWorkoutStep } from './multiDistancePolicy';

export type FoundationCurrentEvidence = {
  weeklyRunningMinutes: number | null;
  continuousRunningMinutes: number | null;
  currentFactsConfirmed: boolean;
  comfortableWalkingConfirmed: boolean;
  context: 'currently_training' | 'first_time_runner' | 'returning_after_break' | 'unknown';
  noInterruptionConfirmed: boolean;
  healthConcern: boolean;
};

/** Research-only candidate. Historical achievements deliberately are not accepted as inputs. */
export function generateFoundationWeek(evidence: FoundationCurrentEvidence, constraints: MultiDistanceRunnerConstraints) {
  const base = { researchOnly: true as const, productionEligible: false as const, policyReference: `${data.policy_id}@${data.version}` };
  const blocked = (reason: string) => ({ ...base, kind: 'blocked' as const, reasonCodes: [reason] });
  if (!isDateOnly(constraints.startDate) || weekday(constraints.startDate) !== 0 || constraints.availableDays.some((day) => !Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 || (day.maxMinutes !== null && (!Number.isFinite(day.maxMinutes) || day.maxMinutes <= 0))) || new Set(constraints.availableDays.map((day) => day.weekday)).size !== constraints.availableDays.length) return blocked('invalid_calendar_constraints');
  if (evidence.healthConcern) return blocked('health_review_required');
  if (evidence.context !== 'currently_training') return blocked(`${evidence.context}_foundation_policy_required`);
  if (!evidence.currentFactsConfirmed || !evidence.comfortableWalkingConfirmed || !evidence.noInterruptionConfirmed) return blocked('current_foundation_evidence_required');
  const weekly = evidence.weeklyRunningMinutes;
  const capacity = evidence.continuousRunningMinutes;
  if (weekly === null || capacity === null || !Number.isFinite(weekly) || !Number.isFinite(capacity) || weekly <= 0 || capacity <= 0) return blocked('invalid_current_capacity');
  const total = weekly * 60;
  if (!Number.isSafeInteger(total) || total < data.parameters.sessions) return blocked('unsupported_running_seconds');
  const durations = Array.from({ length: data.parameters.sessions }, (_, index) => Math.floor(total / data.parameters.sessions) + (index < total % data.parameters.sessions ? 1 : 0));
  if (durations.some((seconds) => seconds > capacity * 60)) return blocked('session_exceeds_confirmed_continuous_capacity');
  const step = (kind: PolicyWorkoutStep['kind'], instruction: string, seconds: number): PolicyWorkoutStep => ({ kind, instruction, purpose: 'Foundation practice', effort: 'Easy, comfortable conversation; stop for concerning symptoms', target: { kind: 'duration_seconds', value: seconds }, repeats: 1 });
  const policy: MultiDistanceTrainingPolicy = {
    id: data.policy_id, version: data.version, goalFamily: constraints.goalFamily, lifecycle: 'draft', releaseAuthorized: false,
    supportedFrequency: [data.parameters.sessions], minimumRecoveryDays: data.parameters.minimum_rest_days,
    sourceReferences: [base.policyReference], requiredEvidence: data.evidence_required, missingCapabilities: data.limitations,
    weeks: [{ week: 1, phase: 'foundation', recoveryWeek: false, taper: false, workouts: durations.map((seconds, index) => ({
      slot: String.fromCharCode(65 + index), role: 'easy', phase: 'foundation', purpose: 'Practice a repeatable running routine', protected: true,
      target: { kind: 'duration_seconds', value: seconds + data.parameters.warmup_walk_seconds + data.parameters.cooldown_walk_seconds },
      steps: [step('warmup', 'Walk comfortably', data.parameters.warmup_walk_seconds), step('work', 'Run at a comfortable conversational effort', seconds), step('cooldown', 'Walk comfortably', data.parameters.cooldown_walk_seconds)],
    })) }],
  };
  const schedule = schedulePolicyWeek(policy, constraints, 1, { researchOnly: true });
  if (schedule.kind === 'blocked') return { ...base, kind: 'blocked' as const, reasonCodes: schedule.reasonCodes.length ? schedule.reasonCodes : ['recovery_spacing'], conflicts: schedule.conflicts };
  const validation = validateFoundationWeek(schedule.workouts, evidence, constraints);
  if (!validation.valid) return { ...base, kind: 'blocked' as const, reasonCodes: validation.issues };
  const walkingSeconds = data.parameters.sessions * (data.parameters.warmup_walk_seconds + data.parameters.cooldown_walk_seconds);
  return { ...base, kind: 'foundation_week' as const, phase: 'foundation' as const, runningSeconds: total, walkingSeconds, totalSeconds: total + walkingSeconds, schedule, validation, warnings: data.limitations };
}

/** Independently checks output, including calendar and exact policy components. */
export function validateFoundationWeek(workouts: readonly ScheduledPolicyWorkout[], evidence: FoundationCurrentEvidence, constraints: MultiDistanceRunnerConstraints) {
  const issues: string[] = [];
  if (evidence.healthConcern || !evidence.currentFactsConfirmed || !evidence.comfortableWalkingConfirmed || !evidence.noInterruptionConfirmed || evidence.context !== 'currently_training') issues.push('unsupported_evidence');
  let running = 0;
  if (workouts.length !== data.parameters.sessions) issues.push('invalid_frequency');
  const dates = workouts.map((w) => w.date).sort();
  for (const [index, workout] of workouts.entries()) {
    const available = constraints.availableDays.find((day) => day.weekday === weekday(workout.date));
    if (!available?.confirmedByRunner || available.maxMinutes === null) issues.push('unconfirmed_availability');
    if (workout.date < constraints.startDate || workout.date > addCalendarDays(constraints.startDate, 6) || constraints.unavailableDates.includes(workout.date)) issues.push('invalid_scheduled_date');
    if (constraints.fixedGoalDate && workout.date >= constraints.fixedGoalDate) issues.push('foundation_goal_date_conflict');
    if (workout.policyReferences.length !== 1 || workout.policyReferences[0] !== `${data.policy_id}@${data.version}`) issues.push('policy_reference_mismatch');
    const expectedKinds = ['warmup', 'work', 'cooldown'];
    let total = 0;
    if (workout.steps.length !== 3) issues.push('invalid_step_structure');
    workout.steps.forEach((step, i) => {
      if (step.kind !== expectedKinds[i] || step.repeats !== 1 || step.target.kind !== 'duration_seconds' || !Number.isSafeInteger(step.target.value) || step.target.value <= 0 || !step.effort || !step.instruction) { issues.push('invalid_step'); return; }
      total += step.target.value;
      if (i === 1) { running += step.target.value; const budget = (evidence.weeklyRunningMinutes ?? 0) * 60; const expected = Math.floor(budget / data.parameters.sessions) + (index < budget % data.parameters.sessions ? 1 : 0); if (step.target.value !== expected) issues.push('unauthorized_workload_distribution'); if (step.target.value > (evidence.continuousRunningMinutes ?? 0) * 60) issues.push('continuous_capacity_exceeded'); }
      else if (step.target.value !== (i === 0 ? data.parameters.warmup_walk_seconds : data.parameters.cooldown_walk_seconds)) issues.push('walking_duration_mismatch');
    });
    if (workout.target.kind !== 'duration_seconds' || workout.target.value !== total) issues.push('duration_mismatch');
    if (available?.maxMinutes !== null && available?.maxMinutes !== undefined && total > available.maxMinutes * 60) issues.push('session_exceeds_time_limit');
    if (index > 0 && dates[index]! <= addCalendarDays(dates[index - 1]!, data.parameters.minimum_rest_days)) issues.push('recovery_spacing');
  }
  if (dates.length && addCalendarDays(dates[0]!, 7) <= addCalendarDays(dates[dates.length - 1]!, data.parameters.minimum_rest_days)) issues.push('week_boundary_recovery');
  if (running !== (evidence.weeklyRunningMinutes ?? 0) * 60) issues.push('weekly_running_mismatch');
  return { valid: issues.length === 0, issues: [...new Set(issues)], progression: 'maintained_current_running_no_future_progression_authored' as const };
}
