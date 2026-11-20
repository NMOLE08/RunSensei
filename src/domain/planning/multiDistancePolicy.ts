import { addCalendarDays } from '@/domain/calendar/operations';
import type { DateOnly } from '@/domain/calendar/dateOnly';

/** Shared policy contract. A policy is usable only when its exact version is authorized. */
export type GoalFamily = '5k' | '10k' | 'half_marathon' | 'marathon';
export type PolicyLifecycle = 'reference_only' | 'draft' | 'under_review' | 'release_ready' | 'deprecated';
export type TrainingTarget = { kind: 'duration_seconds'; value: number } | { kind: 'distance_meters'; value: number } | { kind: 'unknown' };
export type PolicyWorkoutStep = { kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'event'; instruction: string; purpose: string; effort: string | null; target: TrainingTarget; repeats: number };
export type PolicyWorkout = { slot: string; role: string; phase: string; purpose: string; target: TrainingTarget; steps: readonly PolicyWorkoutStep[]; protected: boolean };
export type PolicyWeek = { week: number; phase: string; workouts: readonly PolicyWorkout[]; recoveryWeek: boolean; taper: boolean };
export type MultiDistanceTrainingPolicy = {
  id: string; version: string; goalFamily: GoalFamily; lifecycle: PolicyLifecycle; releaseAuthorized: boolean; testOnly?: boolean;
  supportedFrequency: readonly number[]; minimumRecoveryDays: number; weeks: readonly PolicyWeek[];
  /** Omitted on historical versions: retain their confirmed-limit requirement. */
  availabilityTimeRequirement?: 'confirmed_limits' | 'not_collected';
  sourceReferences: readonly string[]; requiredEvidence: readonly string[]; missingCapabilities: readonly string[];
};
export type MultiDistanceRunnerConstraints = { ownerId: string; goalFamily: GoalFamily; startDate: DateOnly; fixedGoalDate: DateOnly | null; availableDays: readonly { weekday: number; maxMinutes: number | null; confirmedByRunner: boolean }[]; unavailableDates: readonly DateOnly[]; preferredLongRunDay: number | null };
export type MultiDistanceScheduleConflict = { code: 'policy_not_authorized' | 'unsupported_frequency' | 'invalid_policy' | 'unconfirmed_time_limit' | 'missing_time_limit' | 'session_exceeds_time_limit' | 'unavailable_date' | 'recovery_spacing' | 'fixed_goal_date_conflict'; week: number | null; slot: string | null; date: DateOnly | null; requiredMinutes: number | null; availableMinutes: number | null; policyReference: string };
export type ScheduledPolicyWorkout = PolicyWorkout & { week: number; date: DateOnly; policyReferences: readonly string[] };
export type MultiDistanceSchedule = { kind: 'scheduled'; policy: MultiDistanceTrainingPolicy; selectedWeekdays: readonly number[]; workouts: readonly ScheduledPolicyWorkout[]; warnings: readonly string[] } | { kind: 'blocked'; policy: MultiDistanceTrainingPolicy; conflicts: readonly MultiDistanceScheduleConflict[]; reasonCodes: readonly string[] };

export function policyReference(policy: Pick<MultiDistanceTrainingPolicy, 'id' | 'version'>) { return `${policy.id}@${policy.version}`; }
export function validateMultiDistancePolicy(policy: MultiDistanceTrainingPolicy): string[] {
  const issues: string[] = [];
  if (!policy.id || !policy.version || !policy.sourceReferences.length || !policy.requiredEvidence.length) issues.push('policy_metadata_incomplete');
  if (!policy.weeks.length || policy.weeks.some((item, index) => item.week !== index + 1 || !policy.supportedFrequency.includes(item.workouts.length))) issues.push('week_frequency_inconsistent');
  if (policy.minimumRecoveryDays < 0) issues.push('minimum_recovery_invalid');
  for (const week of policy.weeks) for (const workout of week.workouts) {
    if (!workout.slot || !workout.steps.length) issues.push(`workout_structure_missing_w${week.week}`);
    const total = durationSeconds(workout.steps); if (workout.target.kind === 'duration_seconds' && total !== null && total !== workout.target.value) issues.push(`workout_duration_mismatch_w${week.week}_${workout.slot}`);
  }
  return [...new Set(issues)];
}

/** Calendar placement only: this never changes author-provided workout content. */
export function schedulePolicyWeek(policy: MultiDistanceTrainingPolicy, constraints: MultiDistanceRunnerConstraints, weekNumber: number, options: { researchOnly?: boolean } = {}): MultiDistanceSchedule {
  const ref = policyReference(policy);
  if (!policy.releaseAuthorized && !options.researchOnly) return blocked(policy, [{ code: 'policy_not_authorized', week: null, slot: null, date: null, requiredMinutes: null, availableMinutes: null, policyReference: ref }]);
  const issues = validateMultiDistancePolicy(policy); if (issues.length) return blocked(policy, issues.map(() => ({ code: 'invalid_policy' as const, week: null, slot: null, date: null, requiredMinutes: null, availableMinutes: null, policyReference: ref })));
  const week = policy.weeks[weekNumber - 1]; if (!week) return blocked(policy, [{ code: 'invalid_policy', week: weekNumber, slot: null, date: null, requiredMinutes: null, availableMinutes: null, policyReference: ref }]);
  const frequency = week.workouts.length;
  if (!policy.supportedFrequency.includes(frequency) || constraints.availableDays.length < frequency) return blocked(policy, [{ code: 'unsupported_frequency', week: weekNumber, slot: null, date: null, requiredMinutes: null, availableMinutes: null, policyReference: ref }]);
  const candidates = combinations([...constraints.availableDays].sort((a, b) => a.weekday - b.weekday), frequency).filter((days) => hasCircularSpacing(days.map((day) => day.weekday), policy.minimumRecoveryDays));
  const attempts: MultiDistanceScheduleConflict[] = [];
  for (const days of candidates) {
    const ordered = [...days].sort((a, b) => a.weekday - b.weekday);
    const workouts = week.workouts.map((workout, index) => ({ ...workout, week: week.week, date: addCalendarDays(constraints.startDate, (week.week - 1) * 7 + ordered[index]!.weekday) as DateOnly, policyReferences: [ref] }));
    const conflicts: MultiDistanceScheduleConflict[] = [];
    for (const [index, workout] of workouts.entries()) {
      const day = ordered[index]!; const seconds = durationSeconds(workout.steps); const available = day.maxMinutes;
      if (policy.availabilityTimeRequirement === 'not_collected') { /* Personal time feasibility is outside this successor policy's scope. */ }
      else if (!day.confirmedByRunner) conflicts.push({ code: 'unconfirmed_time_limit', week: week.week, slot: workout.slot, date: workout.date, requiredMinutes: seconds === null ? null : seconds / 60, availableMinutes: available, policyReference: ref });
      else if (seconds !== null && available === null) conflicts.push({ code: 'missing_time_limit', week: week.week, slot: workout.slot, date: workout.date, requiredMinutes: seconds / 60, availableMinutes: null, policyReference: ref });
      else if (seconds !== null && available !== null && seconds > available * 60) conflicts.push({ code: 'session_exceeds_time_limit', week: week.week, slot: workout.slot, date: workout.date, requiredMinutes: seconds / 60, availableMinutes: available, policyReference: ref });
      if (constraints.unavailableDates.includes(workout.date)) conflicts.push({ code: 'unavailable_date', week: week.week, slot: workout.slot, date: workout.date, requiredMinutes: seconds === null ? null : seconds / 60, availableMinutes: available, policyReference: ref });
    }
    if (weekNumber === policy.weeks.length && constraints.fixedGoalDate) {
      const event = workouts.find((item) => item.steps.some((step) => step.kind === 'event'));
      if (event && event.date !== constraints.fixedGoalDate) conflicts.push({ code: 'fixed_goal_date_conflict', week: week.week, slot: event.slot, date: event.date, requiredMinutes: null, availableMinutes: null, policyReference: ref });
    }
    if (!conflicts.length) return { kind: 'scheduled', policy, selectedWeekdays: ordered.map((day) => day.weekday), workouts, warnings: policy.availabilityTimeRequirement === 'not_collected' ? ['personal_time_availability_not_assessed'] : [] };
    attempts.push(...conflicts);
  }
  return blocked(policy, attempts);
}

export function durationSeconds(steps: readonly PolicyWorkoutStep[]): number | null {
  if (!steps.every((step) => step.target.kind === 'duration_seconds')) return null;
  return steps.reduce((total, step) => total + (step.target as Extract<TrainingTarget, { kind: 'duration_seconds' }>).value * step.repeats, 0);
}
function blocked(policy: MultiDistanceTrainingPolicy, conflicts: readonly MultiDistanceScheduleConflict[]): MultiDistanceSchedule { return { kind: 'blocked', policy, conflicts, reasonCodes: [...new Set(conflicts.map((item) => item.code))] }; }
function combinations<T>(items: readonly T[], size: number): T[][] { if (size === 0) return [[]]; return items.flatMap((item, index) => combinations(items.slice(index + 1), size - 1).map((tail) => [item, ...tail])); }
function hasCircularSpacing(days: readonly number[], minimum: number) { const sorted = [...days].sort((a, b) => a - b); return sorted.every((day, index) => ((sorted[(index + 1) % sorted.length]! - day + 7) % 7) > minimum); }
