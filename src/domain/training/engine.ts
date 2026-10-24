import { addCalendarDays, nextWeekday } from '@/domain/calendar/operations';
import { fingerprint } from '@/domain/context';
import type { GenerationResult, GeneratedSession, PlanPreview, PlanTemplate, PlanningAvailability, PlanningGoal, PlanningReasonCode, PlanningRequest, RuleConfig } from './content';

export function validateTemplate(template: PlanTemplate, policy: RuleConfig): PlanningReasonCode[] {
  const reasons: PlanningReasonCode[] = [];
  if (template.trainingFrequencyPerWeek !== 3 || template.allowedWeeklyPatterns.some((pattern) => pattern.length !== template.trainingFrequencyPerWeek)) reasons.push('unsupported_frequency');
  if (template.phases.reduce((total, phase) => total + phase.weeks, 0) !== template.authoredDurationWeeks) reasons.push('unsupported_duration', 'phase_order_invalid');
  if (template.phases.at(-1)?.name !== 'taper' || template.phases.at(-1)?.weeks !== policy.protectedTaperWeeks) reasons.push('protected_taper_invalid');
  if (template.ruleConfigId !== policy.id || template.engineCompatibility !== policy.engineCompatibility) reasons.push('no_compatible_template');
  return unique(reasons);
}

export function selectTemplate(request: PlanningRequest, templates: PlanTemplate[], policies: RuleConfig[]): { template: PlanTemplate; policy: RuleConfig } | null {
  for (const template of templates.filter((item) => request.templateMode === 'demo' ? item.demoOnly : (!item.demoOnly && item.reviewState === 'reviewed')).sort(sortTemplate)) { const policy = policies.find((item) => item.id === template.ruleConfigId); if (policy && validateTemplate(template, policy).length === 0) return { template, policy }; }
  return null;
}

export function generatePlan(request: PlanningRequest, template: PlanTemplate, policy: RuleConfig): GenerationResult {
  const templateReasons = validateTemplate(template, policy); if (templateReasons.length) return infeasible(templateReasons);
  if (!request.profile.entryRequirementsMet) return infeasible(['entry_requirements_not_met']);
  if (template.supportedGoal === '5k_completion' && request.goal.distanceMeters !== 5000 || template.supportedGoal === '10k_completion' && request.goal.distanceMeters !== 10000 || template.supportedGoal === 'half_marathon_completion' && request.goal.distanceMeters !== 21097) return infeasible(['no_compatible_template']);
  if (request.templateMode === 'real' && (template.demoOnly || template.reviewState !== 'reviewed')) return infeasible([template.demoOnly ? 'demo_content_only' : 'unreviewed_content']);
  const dateReasons = validateGoal(request.goal, template); if (dateReasons.length) return infeasible(dateReasons);
  const pattern = choosePattern(template, request.availability); if (!pattern) return infeasible(['availability_pattern_incompatible']);
  const sessions = buildSessions(template, request.goal, pattern);
  const constraints = validatePlanConstraints(sessions, request.availability, policy);
  if (constraints.length) return infeasible(constraints);
  const preview: PlanPreview = { templateId: template.id, templateVersion: template.semanticVersion, ruleVersion: policy.semanticVersion, mode: request.templateMode, inputFingerprint: fingerprint({ request, template: [template.id, template.semanticVersion], policy: [policy.id, policy.semanticVersion], pattern }), sessions, schedulePattern: pattern, warnings: template.demoOnly ? ['demo_content_only'] : [] };
  return { kind: 'preview', preview };
}

export function validatePlanConstraints(sessions: GeneratedSession[], availability: PlanningAvailability, policy: RuleConfig): PlanningReasonCode[] {
  const reasons: PlanningReasonCode[] = [];
  const byWeek = new Map<number, GeneratedSession[]>();
  for (const session of sessions) { const limit = availability.weekdayMinuteLimits[weekdayFromDate(session.plannedDate)]; if (!limit || session.durationSeconds > limit * 60) reasons.push('day_time_limit_exceeded'); if (availability.unavailableDates.includes(session.plannedDate)) reasons.push('unavailable_date_conflict'); const week = byWeek.get(session.week) ?? []; week.push(session); byWeek.set(session.week, week); }
  let previousLong: GeneratedSession | undefined;
  for (const weekSessions of byWeek.values()) { const ordered = [...weekSessions].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)); if (ordered.reduce((total, session) => total + session.durationSeconds, 0) > policy.maxWeeklyDurationSeconds) reasons.push('weekly_load_violation'); for (let index = 1; index < ordered.length; index += 1) if (calendarGap(ordered[index - 1].plannedDate, ordered[index].plannedDate) <= policy.minRecoveryDaysBetweenRuns) reasons.push('spacing_violation'); const long = ordered.find((session) => session.role === 'long'); if (long && previousLong && long.durationSeconds - previousLong.durationSeconds > policy.maxLongRunIncreaseSeconds) reasons.push('long_run_progression_violation'); if (long) previousLong = long; }
  return unique(reasons);
}

function validateGoal(goal: PlanningGoal, template: PlanTemplate): PlanningReasonCode[] { if (goal.mode === 'fixed_date' && (!goal.raceDate || goal.raceDate <= goal.startDate)) return ['fixed_date_incompatible']; const end = addCalendarDays(goal.startDate, template.authoredDurationWeeks * 7); return goal.mode === 'fixed_date' && goal.raceDate !== end ? ['fixed_date_incompatible'] : []; }
function choosePattern(template: PlanTemplate, availability: PlanningAvailability): number[] | null { return template.allowedWeeklyPatterns.filter((pattern) => pattern.every((day) => Boolean(availability.weekdayMinuteLimits[day])) && (availability.preferredLongRunDay === null || pattern[2] === availability.preferredLongRunDay)).sort((a, b) => a.join(',').localeCompare(b.join(',')))[0] ?? null; }
function buildSessions(template: PlanTemplate, goal: PlanningGoal, pattern: number[]): GeneratedSession[] { const result: GeneratedSession[] = []; let week = 1; for (const phase of template.phases) for (let phaseWeek = 0; phaseWeek < phase.weeks; phaseWeek += 1) { const weekStart = addCalendarDays(goal.startDate, (week - 1) * 7); phase.sessions.forEach((session, index) => { const plannedDate = nextWeekday(weekStart, pattern[index]); result.push({ id: `${template.id}:w${week}:${session.role}`, logicalKey: `w${week}:${session.role}`, week, plannedDate, phase: phase.name, role: session.role, durationSeconds: session.durationSeconds, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives }); }); week += 1; } return result.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.role.localeCompare(b.role)); }
function weekdayFromDate(date: string): number { const utc = new Date(`${date}T00:00:00Z`).getUTCDay(); return utc === 0 ? 6 : utc - 1; }
function calendarGap(left: string, right: string): number { const cursor = new Date(`${left}T00:00:00Z`); const end = new Date(`${right}T00:00:00Z`); let days = 0; while (cursor < end) { cursor.setUTCDate(cursor.getUTCDate() + 1); days += 1; } return days; }
function unique(values: PlanningReasonCode[]): PlanningReasonCode[] { return [...new Set(values)].sort(); }
function infeasible(reasonCodes: PlanningReasonCode[]): GenerationResult { return { kind: 'infeasible', reasonCodes: unique(reasonCodes) }; }
function sortTemplate(left: PlanTemplate, right: PlanTemplate): number { return left.id.localeCompare(right.id) || left.semanticVersion.localeCompare(right.semanticVersion); }
