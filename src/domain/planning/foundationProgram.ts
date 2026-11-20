import data from '../../../PolicyPack/foundation/02_multiweek_v0.2.0_draft.json';
import successor from '../../../PolicyPack/foundation/05_calendar_availability_v0.3.0_draft.json';
import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { durationSeconds, schedulePolicyWeek, type MultiDistanceRunnerConstraints, type MultiDistanceTrainingPolicy, type PolicyWorkoutStep, type ScheduledPolicyWorkout } from './multiDistancePolicy';

export type FoundationProgramEvidence = {
  context: 'currently_training' | 'first_time_runner' | 'returning_after_break';
  currentWeeklyRunningSeconds: number | null;
  currentContinuousRunningSeconds: number | null;
  currentEvidenceConfirmed: boolean;
  comfortableWalkingConfirmed: boolean;
  demonstratedAfterBreak: boolean;
  healthConcern: boolean;
  healthRelatedInterruption: boolean;
  /** Null means the runner has not made the required explicit choice yet. */
  requestedFrequency: number | null;
};
const positiveInteger = (value: number | null): value is number => value !== null && Number.isSafeInteger(value) && value > 0;

/** Historical workload and break duration deliberately are not prescription inputs. */
export function generateFoundationProgram(e: FoundationProgramEvidence, c: MultiDistanceRunnerConstraints, version = data.version) {
  const calendarOnly = version === successor.version;
  const ref = `${data.policy_id}@${version}`;
  const base = { researchOnly: true as const, productionEligible: false as const, policyReference: ref };
  const blocked = (reason: string) => ({ ...base, kind: 'blocked' as const, reasonCodes: [reason] });
  if (version !== data.version && !calendarOnly) return blocked('foundation_policy_version_unavailable');
  const requestedFrequency = e.requestedFrequency;
  if (e.healthConcern || e.healthRelatedInterruption) return blocked('health_review_required');
  if (!e.currentEvidenceConfirmed || !e.comfortableWalkingConfirmed) return blocked('current_foundation_evidence_required');
  if (e.context === 'returning_after_break' && !e.demonstratedAfterBreak) return blocked('post_break_current_evidence_required');
  if (!positiveInteger(e.currentWeeklyRunningSeconds) || !positiveInteger(e.currentContinuousRunningSeconds)) return blocked('demonstrated_current_running_required');
  if (requestedFrequency === null) return blocked('foundation_frequency_required');
  if (!data.supported_frequency.includes(requestedFrequency)) return blocked('foundation_frequency_policy_gap');
  if (!isDateOnly(c.startDate) || weekday(c.startDate) !== 0 || new Set(c.availableDays.map(d => d.weekday)).size !== c.availableDays.length || c.availableDays.some(d => !Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6 || (!calendarOnly && (d.maxMinutes === null || !Number.isFinite(d.maxMinutes) || d.maxMinutes <= 0)))) return blocked('invalid_calendar_constraints');
  if (e.currentWeeklyRunningSeconds < requestedFrequency) return blocked('insufficient_current_running');
  const initial = e.currentWeeklyRunningSeconds;
  const capacity = e.currentContinuousRunningSeconds;
  const maxAvailableSeconds = Math.max(0, ...c.availableDays.map(day => (day.maxMinutes ?? 0) * 60));
  if (!calendarOnly && Math.ceil(initial / requestedFrequency) + data.warmup_walk_seconds + data.cooldown_walk_seconds > maxAvailableSeconds) return blocked('session_exceeds_time_limit');
  const makeStep = (kind: PolicyWorkoutStep['kind'], seconds: number): PolicyWorkoutStep => ({ kind, instruction: kind === 'work' ? 'Run at a comfortable conversational effort' : 'Walk comfortably', purpose: 'Foundation practice', effort: 'Easy conversational effort; stop for concerning symptoms', target: { kind: 'duration_seconds', value: seconds }, repeats: 1 });
  const policy: MultiDistanceTrainingPolicy = { id: data.policy_id, version: data.version, goalFamily: c.goalFamily, lifecycle: 'draft', releaseAuthorized: false, supportedFrequency: data.supported_frequency, minimumRecoveryDays: data.minimum_rest_days, sourceReferences: [ref], requiredEvidence: ['confirmed current running', 'confirmed walking', 'explicit frequency'], missingCapabilities: data.limitations, weeks: [] };
  const weeks = data.additional_running_seconds_per_session_by_week.map((addition, index) => ({ week: index + 1, phase: 'foundation', recoveryWeek: data.recovery_weeks.includes(index + 1), taper: false, workouts: Array.from({ length: requestedFrequency }, (_, slot) => {
    const running = Math.floor(initial / requestedFrequency) + (slot < initial % requestedFrequency ? 1 : 0) + addition;
    const steps = [makeStep('warmup', data.warmup_walk_seconds)];
    let remaining = running;
    while (remaining > 0) { const segment = Math.min(remaining, capacity); steps.push(makeStep('work', segment)); remaining -= segment; if (remaining > 0) steps.push(makeStep('recovery', data.walking_recovery_seconds)); }
    steps.push(makeStep('cooldown', data.cooldown_walk_seconds));
    return { slot: String.fromCharCode(65 + slot), role: e.context === 'currently_training' ? 'easy' : 'run_walk', phase: 'foundation', purpose: 'Conditional foundation practice', target: { kind: 'duration_seconds' as const, value: durationSeconds(steps)! }, steps, protected: true };
  }) }));
  if (e.context === 'currently_training' && weeks.some(w => w.workouts.some(w => w.steps.filter(s => s.kind === 'work').length > 1))) return blocked('progression_exceeds_confirmed_continuous_capacity');
  policy.weeks = weeks;
  policy.version = version;
  if (calendarOnly) policy.availabilityTimeRequirement = 'not_collected';
  const patterns: typeof c.availableDays[] = [];
  for (let mask = 0; mask < 2 ** c.availableDays.length; mask++) {
    const days = c.availableDays.filter((_, index) => (mask & (1 << index)) !== 0);
    if (days.length === requestedFrequency) patterns.push(days);
  }
  const candidates = weeks.map(week => patterns.map(availableDays => schedulePolicyWeek(policy, { ...c, availableDays }, week.week, { researchOnly: true })));
  const preferenceScore = (candidate: typeof candidates[number][number]) => {
    if (!calendarOnly || c.preferredLongRunDay === null || candidate.kind !== 'scheduled') return 0;
    const durations = candidate.workouts.map(w => durationSeconds(w.steps));
    if (durations.some(d => d === null)) return 0;
    const longest = Math.max(...durations as number[]);
    if (durations.filter(d => d === longest).length !== 1) return 0;
    return weekday(candidate.workouts[durations.indexOf(longest)]!.date) === c.preferredLongRunDay ? 1 : 0;
  };
  if (calendarOnly) candidates.forEach(list => list.sort((a,b) => preferenceScore(b) - preferenceScore(a)));
  const search = (index: number, previous: ScheduledPolicyWorkout[]): ScheduledPolicyWorkout[] | null => {
    if (index === weeks.length) return previous;
    for (const candidate of candidates[index]!) {
      if (candidate.kind !== 'scheduled') continue;
      const last = previous.at(-1);
      if (last && candidate.workouts[0]!.date <= addCalendarDays(last.date, data.minimum_rest_days)) continue;
      const found = search(index + 1, [...previous, ...candidate.workouts]);
      if (found) return found;
    }
    return null;
  };
  const workouts = search(0, []);
  if (!workouts) return { ...base, kind: 'blocked' as const, reasonCodes: [...new Set(candidates.flat().flatMap(candidate => candidate.kind === 'blocked' ? candidate.reasonCodes : []).concat('no_complete_schedule'))], conflicts: candidates.flat().flatMap(candidate => candidate.kind === 'blocked' ? candidate.conflicts : []) };
  const validation = validateFoundationProgram(workouts, e, c, version);
  if (!validation.valid) return { ...base, kind: 'blocked' as const, reasonCodes: validation.issues };
  const warnings = calendarOnly ? [...data.limitations, 'personal_time_availability_not_assessed', ...weeks.flatMap(w => {
    const totals = w.workouts.map(s => durationSeconds(s.steps)!);
    const longest = Math.max(...totals);
    if (totals.filter(t => t === longest).length !== 1) return [`longest_session_tied_week_${w.week}`];
    const scheduled = workouts.find(s => s.week === w.week && s.slot === w.workouts[totals.indexOf(longest)]!.slot)!;
    return c.preferredLongRunDay !== null && weekday(scheduled.date) !== c.preferredLongRunDay ? [`preferred_day_unavailable_under_constraints_week_${w.week}`] : [];
  })] : data.limitations;
  return { ...base, kind: 'foundation_program' as const, goalFamily: c.goalFamily, phase: 'foundation' as const, weeks, workouts, validation, warnings, transition: { kind: 'reassessment_required' as const, afterWeek: data.weeks, goalFamily: c.goalFamily, automaticTransitionAuthorized: false as const } };
}

export function validateFoundationProgram(workouts: readonly ScheduledPolicyWorkout[], e: FoundationProgramEvidence, c: MultiDistanceRunnerConstraints, version = data.version) {
  const calendarOnly = version === successor.version;
  const ref = `${data.policy_id}@${version}`;
  const issues: string[] = [];
  if (version !== data.version && !calendarOnly) issues.push('foundation_policy_version_unavailable');
  const requestedFrequency = e.requestedFrequency;
  if (e.healthConcern || e.healthRelatedInterruption || !e.currentEvidenceConfirmed || !e.comfortableWalkingConfirmed || (e.context === 'returning_after_break' && !e.demonstratedAfterBreak)) issues.push('unsupported_evidence');
  if (requestedFrequency === null || !data.supported_frequency.includes(requestedFrequency) || !positiveInteger(e.currentWeeklyRunningSeconds) || !positiveInteger(e.currentContinuousRunningSeconds)) issues.push('invalid_evidence');
  if (requestedFrequency === null || workouts.length !== data.weeks * requestedFrequency) issues.push('session_count');
  if (workouts.some(w => !Number.isInteger(w.week) || w.week < 1 || w.week > data.weeks || w.steps.length < 3 || w.steps.length % 2 !== 1)) issues.push('invalid_structure');
  const sorted = [...workouts].sort((a,b) => a.date.localeCompare(b.date));
  sorted.forEach((w,i) => {
    const day = c.availableDays.find(d => d.weekday === weekday(w.date));
    const total = durationSeconds(w.steps);
    if (!day) issues.push('unavailable_weekday');
    if (!calendarOnly && (!day?.confirmedByRunner || day.maxMinutes === null || total === null || total > day.maxMinutes * 60)) issues.push('time_limit');
    if (!isDateOnly(w.date) || w.date < addCalendarDays(c.startDate, (w.week - 1) * 7) || w.date > addCalendarDays(c.startDate, w.week * 7 - 1) || c.unavailableDates.includes(w.date)) issues.push('scheduled_date');
    if (c.fixedGoalDate && w.date >= c.fixedGoalDate) issues.push('foundation_goal_date_conflict');
    if (i && w.date <= addCalendarDays(sorted[i-1]!.date, data.minimum_rest_days)) issues.push('recovery_spacing');
    if (w.policyReferences.length !== 1 || w.policyReferences[0] !== ref) issues.push('policy_reference');
    if (w.target.kind !== 'duration_seconds' || w.target.value !== total) issues.push('arithmetic');
    w.steps.forEach((s,j) => {
      const expectedKind = j === 0 ? 'warmup' : j === w.steps.length - 1 ? 'cooldown' : j % 2 ? 'work' : 'recovery';
      if (s.kind !== expectedKind || s.repeats !== 1 || s.target.kind !== 'duration_seconds' || !positiveInteger(s.target.value) || !s.effort) issues.push('step_structure');
      if (s.target.kind === 'duration_seconds') {
        if (s.kind === 'work' && s.target.value > (e.currentContinuousRunningSeconds ?? 0)) issues.push('continuous_capacity');
        if (s.kind !== 'work' && s.target.value !== (s.kind === 'recovery' ? data.walking_recovery_seconds : 300)) issues.push('walking_duration');
      }
    });
  });
  for (let week = 1; week <= data.weeks; week++) {
    const sessions = workouts.filter(w => w.week === week);
    if (requestedFrequency === null || sessions.length !== requestedFrequency) issues.push('weekly_frequency');
    sessions.forEach((w,i) => {
      if (w.slot !== String.fromCharCode(65 + i)) issues.push('slot_order');
      if (e.context === 'currently_training' && w.steps.length !== 3) issues.push('continuous_structure');
      const expected = requestedFrequency === null ? null : Math.floor((e.currentWeeklyRunningSeconds ?? 0) / requestedFrequency) + (i < (e.currentWeeklyRunningSeconds ?? 0) % requestedFrequency ? 1 : 0) + data.additional_running_seconds_per_session_by_week[week-1]!;
      if (durationSeconds(w.steps.filter(s => s.kind === 'work')) !== expected) issues.push('session_progression');
    });
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

/** New previews opt into the successor; historical callers keep v0.2 behavior. */
export function generateCurrentFoundationProgram(e: FoundationProgramEvidence, c: MultiDistanceRunnerConstraints) {
  return generateFoundationProgram(e, c, successor.version);
}
