import periodizationJson from '../../../PolicyPack/01_periodization_policy.json';
import loadJson from '../../../PolicyPack/02_weekly_training_load_policy.json';
import extendedJson from '../../../PolicyPack/03_extended_session_policy.json';
import selectionJson from '../../../PolicyPack/04_workout_selection_policy.json';
import distributionJson from '../../../PolicyPack/05_volume_distribution_policy.json';
import paceJson from '../../../PolicyPack/06_training_pace_policy.json';
import intensityJson from '../../../PolicyPack/07_intensity_policy.json';
import structureJson from '../../../PolicyPack/08_workout_structure_policy.json';
import safetyJson from '../../../PolicyPack/09_scheduling_and_safety_policy.json';
import { addCalendarDays } from '@/domain/calendar/operations';

type RawPolicy = { policy_id: string; version: string; goal_family: string; plan_family: string; review_status: string; release_gate: { can_activate: boolean }; training_rules: Record<string, unknown> };
const pack = [periodizationJson, loadJson, extendedJson, selectionJson, distributionJson, paceJson, intensityJson, structureJson, safetyJson] as unknown as RawPolicy[];
export type First5kDraftSession = { week: number; code: 'A' | 'B' | 'C'; date: string; phase: string; durationSeconds: number | null; distanceMeters: number | null; steps: readonly { kind: 'warmup' | 'run' | 'walk' | 'cooldown' | 'event'; seconds: number | null; repeats: number; rpe: string | null }[]; policyRefs: readonly string[]; draftOnly: true; notForProduction: true };
export type First5kSimulation = { kind: 'draft_simulation'; label: 'DRAFT POLICY SIMULATION — NOT FOR PRODUCTION'; sessions: readonly First5kDraftSession[]; policyRefs: readonly string[] } | { kind: 'blocked'; reasons: string[] };

export function validateFirst5kPolicyPack(): string[] {
  const reasons: string[] = []; if (pack.length !== 9) reasons.push('missing_policy_files');
  if (pack.some((item) => item.goal_family !== '5k' || item.plan_family !== 'first_5k_true_beginner_run_walk')) reasons.push('family_mismatch');
  if (pack.some((item) => item.review_status !== 'draft' || item.release_gate.can_activate)) reasons.push('release_status_invalid');
  if (new Set(pack.map((item) => `${item.policy_id}@${item.version}`)).size !== 9) reasons.push('duplicate_policy_version');
  const templates = (structureJson as any).training_rules?.week_by_week_session_templates; if (!Array.isArray(templates) || templates.length !== 12) reasons.push('invalid_workout_templates');
  return reasons;
}
export const first5kPolicyRefs = () => pack.map((item) => `${item.policy_id}@${item.version}`);

/** Exact offline-only rendering of supplied JSON. Never produces an activatable plan. */
export const first5kWorkoutPolicyPack = { policyId: 'runsensei.5k.first_5k_true_beginner_run_walk.pack', version: '0.1.0-draft', policyReferences: first5kPolicyRefs() } as const;

export function simulateFirst5kDraft(startMonday: string, availableDays: number[] = [1, 3, 6], healthConcern = false): First5kSimulation {
  const integrity = validateFirst5kPolicyPack(); if (integrity.length) return { kind: 'blocked', reasons: integrity };
  if (healthConcern) return { kind: 'blocked', reasons: ['health_hold_seek_appropriate_clinical_evaluation'] };
  const days = chooseFirst5kTrainingDays(availableDays); if (!days) return { kind: 'blocked', reasons: ['availability_requires_three_nonconsecutive_days'] };
  const refs = first5kPolicyRefs(); const weeks = (structureJson as any).training_rules.week_by_week_session_templates as any[];
  const phases = (periodizationJson as any).training_rules.phase_schedule as any[];
  const sessions: First5kDraftSession[] = [];
  for (const weekTemplate of weeks) { const week = weekTemplate.week as number; const phase = phases.find((item) => week >= item.weeks[0] && week <= item.weeks[1])?.phase ?? 'unknown'; for (const [index, code] of (['A', 'B', 'C'] as const).entries()) { const raw = weekTemplate.sessions[code]; const date = addCalendarDays(startMonday as `${number}-${number}-${number}`, (week - 1) * 7 + days[index]); sessions.push(renderSession(week, code, date, phase, raw, refs)); } }
  const arithmetic = reconcile(sessions); if (arithmetic.length) return { kind: 'blocked', reasons: arithmetic };
  return { kind: 'draft_simulation', label: 'DRAFT POLICY SIMULATION — NOT FOR PRODUCTION', sessions, policyRefs: refs };
}
/** Shared calendar-only scheduling primitive; it contains no workload rule. */
export function chooseFirst5kTrainingDays(days: number[]) { const unique = [...new Set(days)].sort((a, b) => a - b); if (unique.length < 3) return null; const combos = unique.flatMap((a, i) => unique.slice(i + 1).flatMap((b, j) => unique.slice(i + j + 2).map((c) => [a, b, c]))); return combos.find((item) => item.every((day, index) => ((item[(index + 1) % 3] - day + 7) % 7) >= 2)) ?? null; }
function renderSession(week: number, code: 'A' | 'B' | 'C', date: string, phase: string, raw: any, policyRefs: readonly string[]): First5kDraftSession { if (raw.type === 'walk_run_5k_event') return { week, code, date, phase, durationSeconds: null, distanceMeters: 5000, steps: [{ kind: 'warmup', seconds: 300, repeats: 1, rpe: '1-3' }, { kind: 'event', seconds: null, repeats: 1, rpe: 'self_selected_comfortable' }, { kind: 'cooldown', seconds: 300, repeats: 1, rpe: '1-3' }], policyRefs, draftOnly: true, notForProduction: true }; return { week, code, date, phase, durationSeconds: raw.main_movement_seconds + 600, distanceMeters: null, steps: [{ kind: 'warmup', seconds: 300, repeats: 1, rpe: '1-3' }, { kind: 'run', seconds: raw.run_seconds, repeats: raw.repetitions, rpe: '3-4' }, { kind: 'walk', seconds: raw.walk_seconds, repeats: raw.repetitions, rpe: '1-3' }, { kind: 'cooldown', seconds: 300, repeats: 1, rpe: '1-3' }], policyRefs, draftOnly: true, notForProduction: true }; }
function reconcile(sessions: readonly First5kDraftSession[]) { const reasons: string[] = []; const loads = (loadJson as any).training_rules.week_by_week_budget as any[]; const extended = (extendedJson as any).training_rules.week_by_week_extended_session as any[]; const distribution = (distributionJson as any).training_rules.weekly_distribution as any[]; const selection = (selectionJson as any).training_rules; const pace = (paceJson as any).training_rules; const intensity = (intensityJson as any).training_rules; if (selection.prohibited_until_separately_reviewed?.includes('speedwork') !== true || pace.gps_pace_target_seconds_per_km !== null || intensity.max_demanding_sessions_per_week !== 0) reasons.push('pace_or_intensity_policy_invalid'); if (sessions.length !== 36) reasons.push('session_count_mismatch'); for (let week = 1; week <= 12; week += 1) { const current = sessions.filter((item) => item.week === week); if (current.length !== 3) reasons.push(`weekly_session_count_w${week}`); for (const session of current) { if (week <= 11) { const total = session.steps.reduce((sum, step) => sum + (step.seconds ?? 0) * step.repeats, 0); if (total !== session.durationSeconds) reasons.push(`step_total_mismatch_w${session.week}${session.code}`); } } const c = current.find((item) => item.code === 'C'); const load = loads.find((item) => item.week === week); const long = extended.find((item) => item.week === week); const allocation = distribution.find((item) => item.week === week); if (week <= 11 && c && load && long && allocation) { const main = current.reduce((sum, item) => sum + (item.durationSeconds ?? 0) - 600, 0); if (main !== load.planned_main_movement_seconds) reasons.push(`weekly_main_budget_mismatch_w${week}`); if ((c.durationSeconds ?? 0) - 600 !== long.main_movement_seconds) reasons.push(`extended_budget_mismatch_w${week}`); for (const session of current) if ((session.durationSeconds ?? 0) - 600 !== allocation.session_main_seconds[session.code]) reasons.push(`distribution_mismatch_w${week}${session.code}`); if (week === 4 || week === 8) { const previous = loads.find((item) => item.week === week - 1); if (!previous || load.planned_main_movement_seconds >= previous.planned_main_movement_seconds) reasons.push(`recovery_week_not_protected_w${week}`); } } if (week === 12 && c && (c.distanceMeters !== 5000 || c.durationSeconds !== null)) reasons.push('event_target_invalid'); } return reasons; }
