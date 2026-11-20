import periodizationJson from '../../../PolicyPack/continuous_5k_beginner/01_periodization_policy.json';
import loadJson from '../../../PolicyPack/continuous_5k_beginner/02_weekly_training_load_policy.json';
import extendedJson from '../../../PolicyPack/continuous_5k_beginner/03_extended_session_policy.json';
import selectionJson from '../../../PolicyPack/continuous_5k_beginner/04_workout_selection_policy.json';
import distributionJson from '../../../PolicyPack/continuous_5k_beginner/05_volume_distribution_policy.json';
import paceJson from '../../../PolicyPack/continuous_5k_beginner/06_training_pace_policy.json';
import intensityJson from '../../../PolicyPack/continuous_5k_beginner/07_intensity_policy.json';
import structureJson from '../../../PolicyPack/continuous_5k_beginner/08_workout_structure_policy.json';
import safetyJson from '../../../PolicyPack/continuous_5k_beginner/09_scheduling_and_safety_policy.json';
import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import { chooseFirst5kTrainingDays, type First5kDraftSession, type First5kSimulation } from './first5kPolicyPack';
import type { First5kSafetyValidation, First5kViolation } from './first5kSafetyValidator';

type RawPolicy = { policy_id: string; version: string; goal_family: string; plan_family: string; review_status: string; release_gate: { can_activate: boolean }; training_rules: Record<string, any> };
const pack = [periodizationJson, loadJson, extendedJson, selectionJson, distributionJson, paceJson, intensityJson, structureJson, safetyJson] as unknown as RawPolicy[];
export const continuous5kPolicyRefs = () => pack.map((item) => `${item.policy_id}@${item.version}`);
export const continuous5kWorkoutPolicyPack = { policyId: 'runsensei.5k.continuous_beginner.pack', version: '0.1.0-draft', policyReferences: continuous5kPolicyRefs() } as const;

export function validateContinuous5kPolicyPack(): string[] {
  const reasons: string[] = [];
  if (pack.length !== 9) reasons.push('missing_policy_files');
  if (pack.some((item) => item.goal_family !== '5k' || item.plan_family !== 'continuous_running_beginner_5k')) reasons.push('family_mismatch');
  if (pack.some((item) => item.review_status !== 'draft' || item.release_gate.can_activate)) reasons.push('release_status_invalid');
  if (new Set(continuous5kPolicyRefs()).size !== 9) reasons.push('duplicate_policy_version');
  const weeks = structureJson.training_rules.week_by_week_session_templates;
  if (!Array.isArray(weeks) || weeks.length !== 12) reasons.push('invalid_workout_templates');
  return reasons;
}

/** Separate, draft-only programme. Its values are source-labelled candidate content. */
export function simulateContinuous5kDraft(startMonday: string, availableDays: number[] = [1, 3, 6], healthConcern = false): First5kSimulation {
  const integrity = validateContinuous5kPolicyPack(); if (integrity.length) return { kind: 'blocked', reasons: integrity };
  if (healthConcern) return { kind: 'blocked', reasons: ['health_hold_seek_appropriate_clinical_evaluation'] };
  const days = chooseFirst5kTrainingDays(availableDays); if (!days) return { kind: 'blocked', reasons: ['availability_requires_three_nonconsecutive_days'] };
  const refs = continuous5kPolicyRefs(); const sessions: First5kDraftSession[] = [];
  for (const template of structureJson.training_rules.week_by_week_session_templates) {
    const phase = periodizationJson.training_rules.phase_schedule.find((item) => template.week >= item.weeks[0] && template.week <= item.weeks[1])?.phase ?? 'unknown';
    for (const [index, code] of (['A', 'B', 'C'] as const).entries()) sessions.push(render(template.week, code, addCalendarDays(startMonday as `${number}-${number}-${number}`, (template.week - 1) * 7 + days[index]), phase, template.sessions[code], refs));
  }
  return reconcile(sessions).length ? { kind: 'blocked', reasons: reconcile(sessions) } : { kind: 'draft_simulation', label: 'DRAFT POLICY SIMULATION — NOT FOR PRODUCTION', sessions, policyRefs: refs };
}

function render(week: number, code: 'A' | 'B' | 'C', date: string, phase: string, raw: any, refs: readonly string[]): First5kDraftSession {
  if (raw.type === 'walk_run_5k_event') return { week, code, date, phase, durationSeconds: null, distanceMeters: 5000, steps: [{ kind: 'warmup', seconds: 300, repeats: 1, rpe: '1-3' }, { kind: 'event', seconds: null, repeats: 1, rpe: 'self_selected_comfortable' }, { kind: 'cooldown', seconds: 300, repeats: 1, rpe: '1-3' }], policyRefs: refs, draftOnly: true, notForProduction: true };
  return { week, code, date, phase, durationSeconds: raw.main_running_seconds + 600, distanceMeters: null, steps: [{ kind: 'warmup', seconds: 300, repeats: 1, rpe: '1-3' }, { kind: 'run', seconds: raw.main_running_seconds, repeats: 1, rpe: '3-4' }, { kind: 'cooldown', seconds: 300, repeats: 1, rpe: '1-3' }], policyRefs: refs, draftOnly: true, notForProduction: true };
}

function reconcile(sessions: readonly First5kDraftSession[]): string[] {
  const reasons: string[] = []; const weeks = loadJson.training_rules.week_by_week_main_seconds; const extended = extendedJson.training_rules.week_by_week_extended_session_seconds; const distribution = distributionJson.training_rules.session_main_seconds;
  for (let week = 1; week <= 12; week += 1) {
    const current = sessions.filter((item) => item.week === week); const c = current.find((item) => item.code === 'C');
    if (current.length !== 3) reasons.push(`weekly_session_count_w${week}`);
    if (week <= 11) {
      const main = current.reduce((sum, item) => sum + (item.durationSeconds ?? 0) - 600, 0);
      if (main !== weeks[week - 1]) reasons.push(`weekly_main_budget_mismatch_w${week}`);
      if ((c?.durationSeconds ?? 0) - 600 !== extended[week - 1]) reasons.push(`extended_budget_mismatch_w${week}`);
      for (const [index, code] of (['A', 'B', 'C'] as const).entries()) if (((current.find((item) => item.code === code)?.durationSeconds ?? 0) - 600) !== distribution[week - 1][index]) reasons.push(`distribution_mismatch_w${week}${code}`);
      if ([4, 8].includes(week)) {
        const previous = sessions.filter((item) => item.week === week - 1).reduce((sum, item) => sum + (item.durationSeconds ?? 0) - 600, 0);
        if (main >= previous) reasons.push(`recovery_week_not_protected_w${week}`);
      }
    } else if (c?.distanceMeters !== 5000 || c.durationSeconds !== null) reasons.push('event_target_invalid');
  }
  return reasons;
}

export function validateContinuous5kDraftSimulation(simulation: First5kSimulation, options: { healthConcern?: boolean; unavailableDates?: string[] } = {}): First5kSafetyValidation {
  const violations: First5kViolation[] = []; const refs = continuous5kPolicyRefs(); const make = (code: string, rule: string, message: string): First5kViolation => ({ code, policyRef: refs[8] ?? 'policy-unavailable', rule, message });
  for (const code of validateContinuous5kPolicyPack()) violations.push(make(code, 'pack_integrity', 'The continuous-running draft policy pack is incomplete or inconsistent.'));
  if (simulation.kind === 'blocked') for (const code of simulation.reasons) violations.push(make(code, 'simulation_precondition', 'The simulator blocked this input.'));
  if (options.healthConcern) violations.push(make('health_hold', 'health_gate', 'A health concern blocks this draft simulation.'));
  if (simulation.kind === 'draft_simulation') {
    if (simulation.sessions.length !== 36) violations.push(make('session_count_mismatch', 'total_session_count', 'The policy requires exactly 36 sessions.'));
    for (const session of simulation.sessions) {
      if (session.policyRefs.length !== refs.length || session.policyRefs.some((ref, index) => ref !== refs[index])) violations.push(make('policy_reference_mismatch', 'full_provenance', 'Every session must preserve the continuous-pack references.'));
      if ((options.unavailableDates ?? []).includes(session.date)) violations.push(make('unavailable_date_conflict', 'availability', 'A session falls on an unavailable date.'));
      const warmup = session.steps.find((step) => step.kind === 'warmup'); const cooldown = session.steps.find((step) => step.kind === 'cooldown');
      if (warmup?.seconds !== 300 || cooldown?.seconds !== 300) violations.push(make('warmup_cooldown_mismatch', 'five_minute_walks', 'Each session requires its authored warm-up and cooldown.'));
      if (session.week < 12 && session.steps.reduce((sum, step) => sum + (step.seconds ?? 0) * step.repeats, 0) !== session.durationSeconds) violations.push(make('workout_arithmetic_mismatch', 'step_sum', 'Workout steps do not equal the planned duration.'));
    }
    for (let week = 1; week <= 12; week += 1) { const current = simulation.sessions.filter((item) => item.week === week); const days = current.map((item) => weekday(item.date as `${number}-${number}-${number}`)).sort((a, b) => a - b); if (new Set(days).size !== 3 || days.some((day, index) => ((days[(index + 1) % days.length] - day + 7) % 7) < 2)) violations.push(make('recovery_spacing_violation', 'nonconsecutive_days', `Week ${week} does not preserve a full rest day.`)); }
    for (const code of reconcile(simulation.sessions)) violations.push(make(code, 'programme_specific_arithmetic', 'The generated programme differs from its immutable draft table.'));
  }
  return { valid: violations.length === 0, violations, warnings: ['DRAFT POLICY SIMULATION — NOT FOR PRODUCTION', 'Candidate continuous-running values require qualified coach and safety review.'], appliedPolicyReferences: refs, reviewStatus: 'draft', productionEligible: false };
}
