import type { DateOnly } from '@/domain/calendar/dateOnly';
import { weekday } from '@/domain/calendar/operations';
import type { Draft5kWorkoutProgram } from './draft5kProgramRegistry';
import type { First5kDraftSession, First5kSimulation } from './first5kPolicyPack';
import type { NormalizedRunnerConstraints } from './runnerConstraints';
import { usesCalendarAvailability, type Beginner5kAvailabilityReference } from './beginner5kCalendarAvailability';

export type ScheduleConflict = {
  code: 'unconfirmed_time_limit' | 'missing_time_limit' | 'session_exceeds_time_limit' | 'unavailable_date' | 'fixed_goal_date_conflict' | 'structural_validation_failed';
  week: number | null; workout: 'A' | 'B' | 'C' | null; date: string | null; weekday: number | null;
  requiredMinutes: number | null; availableMinutes: number | null; policyReference: string; details: string;
};
export type ScheduleAttempt = { weekdays: readonly number[]; feasible: boolean; conflicts: readonly ScheduleConflict[] };
export type FrequencyCapability = { authoredSessionsPerWeek: 3; availableDays: number; status: 'supported' | 'scheduling_options' | 'policy_gap'; reasonCode: string | null };
export type ScheduleFeasibilityResult =
  | { kind: 'feasible'; frequency: FrequencyCapability; simulation: Extract<First5kSimulation, { kind: 'draft_simulation' }>; attempts: readonly ScheduleAttempt[]; selectedWeekdays: readonly number[]; warnings: readonly string[]; validation: ReturnType<Draft5kWorkoutProgram['validate']> }
  | { kind: 'infeasible' | 'policy_gap'; frequency: FrequencyCapability; attempts: readonly ScheduleAttempt[]; conflicts: readonly ScheduleConflict[]; reasonCodes: readonly string[] };

/** Searches calendar placements only. It never changes session content or frequency. */
export function evaluateScheduleFeasibility(program: Draft5kWorkoutProgram, constraints: NormalizedRunnerConstraints, availability?: Beginner5kAvailabilityReference): ScheduleFeasibilityResult {
  const available = constraints.scheduling.availableDays;
  const frequency = describeFrequencyCapability(available.length);
  if (availability && !usesCalendarAvailability(availability)) return { kind: 'policy_gap', frequency, attempts: [], conflicts: [], reasonCodes: ['availability_policy_unavailable'] };
  if (frequency.status === 'policy_gap') return { kind: 'policy_gap', frequency, attempts: [], conflicts: [], reasonCodes: [frequency.reasonCode!] };
  if (!constraints.scheduling.weekAnchor) return { kind: 'infeasible', frequency, attempts: [], conflicts: [], reasonCodes: ['invalid_plan_start_date'] };
  const triples = combinations(available.map((item) => item.weekday), 3).filter(hasCircularRecoverySpacing);
  if (!triples.length) return { kind: 'infeasible', frequency, attempts: [], conflicts: [], reasonCodes: ['no_three_day_recovery_pattern'] };
  const attempts: ScheduleAttempt[] = [];
  const feasibleCandidates: { days: readonly number[]; simulation: Extract<First5kSimulation, { kind: 'draft_simulation' }>; validation: ReturnType<Draft5kWorkoutProgram['validate']>; preference: LongestWorkoutPreference }[] = [];
  for (const days of triples) {
    const simulation = program.simulate(constraints.scheduling.weekAnchor, [...days], false);
    if (simulation.kind === 'blocked') { attempts.push({ weekdays: days, feasible: false, conflicts: simulation.reasons.map((code) => genericConflict(code, program)) }); continue; }
    const conflicts = conflictsFor(simulation.sessions, constraints, program).filter(conflict => !(usesCalendarAvailability(availability) && ['missing_time_limit', 'unconfirmed_time_limit', 'session_exceeds_time_limit'].includes(conflict.code)));
    const validation = program.validate(simulation, { healthConcern: constraints.safety.healthConcern, unavailableDates: [...constraints.scheduling.unavailableDates] });
    for (const violation of validation.violations) conflicts.push({ code: 'structural_validation_failed', week: null, workout: null, date: null, weekday: null, requiredMinutes: null, availableMinutes: null, policyReference: violation.policyRef, details: violation.code });
    const unique = uniqueConflicts(conflicts); attempts.push({ weekdays: days, feasible: unique.length === 0, conflicts: unique });
    if (!unique.length) feasibleCandidates.push({ days, simulation, validation, preference: longestWorkoutPreference(simulation.sessions, constraints.scheduling.preferredLongDay) });
  }
  if (feasibleCandidates.length) {
    const selected = [...feasibleCandidates].sort((left, right) => right.preference.matches - left.preference.matches || left.days.join(',').localeCompare(right.days.join(',')))[0]!;
    const warnings = ['week_12_event_duration_unknown_time_limit_not_validated'];
    if (availability) warnings.push('personal_time_availability_not_assessed', `${availability.policyId}@${availability.version}`);
    if (selected.preference.ambiguousWeeks.length) warnings.push(`longest_workout_preference_ambiguous_weeks:${selected.preference.ambiguousWeeks.join(',')}`);
    if (constraints.scheduling.preferredLongDay !== null && selected.preference.matches === 0) warnings.push('preferred_longest_day_not_used_due_to_recovery_or_authored_session_order');
    return { kind: 'feasible', frequency, simulation: selected.simulation, attempts, selectedWeekdays: selected.days, warnings, validation: selected.validation };
  }
  const best = [...attempts].sort((left, right) => left.conflicts.length - right.conflicts.length || left.weekdays.join(',').localeCompare(right.weekdays.join(',')))[0];
  return { kind: 'infeasible', frequency, attempts, conflicts: best?.conflicts ?? [], reasonCodes: [...new Set((best?.conflicts ?? []).map((item) => item.code))] };
}

type LongestWorkoutPreference = { matches: number; ambiguousWeeks: readonly number[] };

/**
 * Uses complete authored session duration, never running time alone. Unknown or tied
 * weeks are intentionally not guessed; the caller exposes them as schedule warnings.
 */
function longestWorkoutPreference(sessions: readonly First5kDraftSession[], preferredDay: number | null): LongestWorkoutPreference {
  if (preferredDay === null) return { matches: 0, ambiguousWeeks: [] };
  const ambiguousWeeks: number[] = []; let matches = 0;
  for (const week of [...new Set(sessions.map((item) => item.week))]) {
    const weekSessions = sessions.filter((item) => item.week === week);
    if (weekSessions.some((item) => item.durationSeconds === null)) { ambiguousWeeks.push(week); continue; }
    const longest = Math.max(...weekSessions.map((item) => item.durationSeconds!));
    const longestSessions = weekSessions.filter((item) => item.durationSeconds === longest);
    if (longestSessions.length !== 1) { ambiguousWeeks.push(week); continue; }
    if (weekday(longestSessions[0]!.date as DateOnly) === preferredDay) matches += 1;
  }
  return { matches, ambiguousWeeks };
}

export function describeFrequencyCapability(availableDays: number): FrequencyCapability {
  if (availableDays < 3) return { authoredSessionsPerWeek: 3, availableDays, status: 'policy_gap', reasonCode: 'two_day_policy_not_authored' };
  return { authoredSessionsPerWeek: 3, availableDays, status: availableDays === 3 ? 'supported' : 'scheduling_options', reasonCode: availableDays > 3 ? 'additional_days_are_scheduling_options_not_extra_workouts' : null };
}

/** Candidate-gate helper: checks only authored Week 1 time fit across every valid three-day subset. */
export function hasFeasibleWeekOnePlacement(program: Draft5kWorkoutProgram, weekAnchor: string, availableDays: readonly number[], limits: Readonly<Record<number, number | null>>): boolean {
  return combinations([...new Set(availableDays)].sort((a, b) => a - b), 3).filter(hasCircularRecoverySpacing).some((days) => {
    const simulation = program.simulate(weekAnchor, days, false); if (simulation.kind === 'blocked') return false;
    return simulation.sessions.filter((session) => session.week === 1).every((session) => {
      if (session.durationSeconds === null) return true; const limit = limits[weekday(session.date as DateOnly)]; return limit !== null && limit !== undefined && session.durationSeconds <= limit * 60;
    });
  });
}
function conflictsFor(sessions: readonly First5kDraftSession[], constraints: NormalizedRunnerConstraints, program: Draft5kWorkoutProgram): ScheduleConflict[] {
  const byDay = new Map(constraints.scheduling.availableDays.map((item) => [item.weekday, item])); const conflicts: ScheduleConflict[] = [];
  for (const session of sessions) {
    const day = weekday(session.date as DateOnly); const limit = byDay.get(day); const ref = `${program.workoutPolicyPack.policyId}@${program.workoutPolicyPack.version}`;
    if (!limit) conflicts.push(conflict('missing_time_limit', session, day, null, ref, 'The scheduled weekday is not available.'));
    else if (!limit.confirmedByRunner) conflicts.push(conflict('unconfirmed_time_limit', session, day, limit.maxMinutes, ref, 'The automatically populated time limit has not been confirmed by the runner.'));
    else if (session.durationSeconds !== null && (limit.maxMinutes === null || session.durationSeconds > limit.maxMinutes * 60)) conflicts.push(conflict(limit.maxMinutes === null ? 'missing_time_limit' : 'session_exceeds_time_limit', session, day, limit.maxMinutes, ref, 'The authored full session does not fit this day.'));
    if (constraints.scheduling.unavailableDates.includes(session.date as DateOnly)) conflicts.push(conflict('unavailable_date', session, day, limit?.maxMinutes ?? null, ref, 'The runner marked this date unavailable.'));
  }
  const event = sessions.find((item) => item.week === 12 && item.code === 'C');
  if (constraints.goal.fixedDate && event?.date !== constraints.goal.fixedDate) conflicts.push({ code: 'fixed_goal_date_conflict', week: 12, workout: 'C', date: event?.date ?? null, weekday: event ? weekday(event.date as DateOnly) : null, requiredMinutes: null, availableMinutes: event ? byDay.get(weekday(event.date as DateOnly))?.maxMinutes ?? null : null, policyReference: `${program.workoutPolicyPack.policyId}@${program.workoutPolicyPack.version}`, details: `The authored event date ${event?.date ?? 'unknown'} does not match fixed goal date ${constraints.goal.fixedDate}.` });
  return conflicts;
}
function conflict(code: ScheduleConflict['code'], session: First5kDraftSession, day: number, availableMinutes: number | null, policyReference: string, details: string): ScheduleConflict { return { code, week: session.week, workout: session.code, date: session.date, weekday: day, requiredMinutes: session.durationSeconds === null ? null : session.durationSeconds / 60, availableMinutes, policyReference, details }; }
function genericConflict(code: string, program: Draft5kWorkoutProgram): ScheduleConflict { return { code: 'structural_validation_failed', week: null, workout: null, date: null, weekday: null, requiredMinutes: null, availableMinutes: null, policyReference: `${program.workoutPolicyPack.policyId}@${program.workoutPolicyPack.version}`, details: code }; }
function combinations<T>(items: readonly T[], size: number): T[][] { if (size === 0) return [[]]; return items.flatMap((item, index) => combinations(items.slice(index + 1), size - 1).map((tail) => [item, ...tail])); }
function hasCircularRecoverySpacing(days: readonly number[]) { const sorted = [...days].sort((a, b) => a - b); return sorted.every((day, index) => ((sorted[(index + 1) % sorted.length] - day + 7) % 7) >= 2); }
function uniqueConflicts(items: ScheduleConflict[]) { return items.filter((item, index) => items.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index); }
