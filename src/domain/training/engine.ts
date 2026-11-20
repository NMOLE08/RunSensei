import { addCalendarDays, nextWeekday, weekday } from '@/domain/calendar/operations';
import { fingerprint } from '@/domain/context';
import type { BaselineCompatibility, GenerationResult, GeneratedSession, PlanPreview, PlanTemplate, PlanningAvailability, PlanningGoal, PlanningProfile, PlanningReasonCode, PlanningRequest, RuleConfig, SessionBlueprint } from './content';

export interface TemplateSelection { template: PlanTemplate; policy: RuleConfig; explanation: string; }

export function validateTemplate(template: PlanTemplate, policy: RuleConfig): PlanningReasonCode[] {
  const reasons: PlanningReasonCode[] = [];
  if (!template.id.trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(template.semanticVersion) || !template.author.trim() || !template.rightsSourceNotes.trim() || !template.entryRequirementReference.trim() || !policy.id.trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(policy.semanticVersion) || !policy.author.trim() || !policy.rightsSourceNotes.trim() || template.reviewState === 'retired' || policy.reviewState === 'retired' || template.contentStatus === 'retired') reasons.push('invalid_content');
  if (!Number.isInteger(template.authoredDurationWeeks) || template.authoredDurationWeeks < 1 || !Number.isInteger(policy.minRecoveryDaysBetweenRuns) || policy.minRecoveryDaysBetweenRuns < 0 || !Number.isFinite(policy.maxWeeklyDurationSeconds) || policy.maxWeeklyDurationSeconds <= 0 || !Number.isFinite(policy.maxLongRunIncreaseSeconds) || policy.maxLongRunIncreaseSeconds < 0 || !Number.isInteger(policy.protectedTaperWeeks) || policy.protectedTaperWeeks < 1) reasons.push('invalid_content');
  if (template.trainingFrequencyPerWeek < 1 || template.allowedWeeklyPatterns.length === 0 || template.allowedWeeklyPatterns.some((pattern) => pattern.length !== template.trainingFrequencyPerWeek || new Set(pattern).size !== pattern.length || pattern.some((day) => day < 0 || day > 6))) reasons.push('unsupported_frequency');
  for (const pattern of template.allowedWeeklyPatterns) { const days = [...pattern].sort((a, b) => a - b); if (days.length > 1 && days.some((day, index) => ((days[(index + 1) % days.length] - day + 7) % 7) <= policy.minRecoveryDaysBetweenRuns)) reasons.push('spacing_violation'); }
  if (template.phases.reduce((total, phase) => total + phase.weeks, 0) !== template.authoredDurationWeeks) reasons.push('unsupported_duration', 'phase_order_invalid');
  const order = ['foundation', 'endurance_development', 'race_preparation', 'taper'];
  if (template.phases.some((phase, index) => !Number.isInteger(phase.weeks) || phase.weeks < 1 || (index > 0 && order.indexOf(phase.name) <= order.indexOf(template.phases[index - 1].name)))) reasons.push('phase_order_invalid');
  if (template.phases.some((phase) => phase.sessions.length !== template.trainingFrequencyPerWeek || phase.weeklySessions && (phase.weeklySessions.length !== phase.weeks || phase.weeklySessions.some((week) => week.length !== template.trainingFrequencyPerWeek)))) reasons.push('unsupported_frequency');
  let previousLong: number | undefined;
  for (const phase of template.phases) for (const week of phase.weeklySessions ?? Array.from({ length: phase.weeks }, () => phase.sessions)) {
    if (week.reduce((total, session) => total + session.durationSeconds, 0) > policy.maxWeeklyDurationSeconds) reasons.push('weekly_load_violation');
    const long = week.find((session) => session.role === 'long');
    if (long && previousLong !== undefined && long.durationSeconds - previousLong > policy.maxLongRunIncreaseSeconds) reasons.push('long_run_progression_violation');
    if (long) previousLong = long.durationSeconds;
    for (const session of week) {
    if (!session.purpose.trim() || !session.effortCue.trim() || !Number.isInteger(session.durationSeconds) || session.durationSeconds <= 0 || session.steps.length === 0 || session.steps.some((step) => !step.label.trim() || !step.instruction.trim() || (step.durationSeconds !== undefined && (!Number.isInteger(step.durationSeconds) || step.durationSeconds <= 0)))) reasons.push('invalid_content');
    const targets = [session.target, ...session.steps.map((step) => step.target)].filter((target) => target !== undefined);
    if (targets.some((target) => !Number.isInteger(target.value) || target.value <= 0 || !['duration_seconds', 'distance_meters'].includes(target.kind))) reasons.push('invalid_content');
    if (session.target?.kind === 'duration_seconds' && session.target.value !== session.durationSeconds) reasons.push('step_duration_mismatch');
    const timed = session.steps.filter((step) => step.durationSeconds !== undefined); if (timed.length && (timed.length !== session.steps.length || timed.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0) !== session.durationSeconds)) reasons.push('step_duration_mismatch');
    if (session.target && session.steps.every((step) => step.target?.kind === session.target?.kind) && session.steps.reduce((sum, step) => sum + (step.target?.value ?? 0), 0) !== session.target.value) reasons.push('invalid_content');
    }
  }
  if (template.phases.at(-1)?.name !== 'taper' || template.phases.at(-1)?.weeks !== policy.protectedTaperWeeks) reasons.push('protected_taper_invalid');
  if (template.ruleConfigId !== policy.id || template.engineCompatibility !== policy.engineCompatibility) reasons.push('no_compatible_template');
  return unique(reasons);
}

export function assessBaseline(profile: PlanningProfile, criteria?: BaselineCompatibility): PlanningReasonCode[] {
  if (!profile.entryRequirementsMet) return ['entry_requirements_not_met'];
  if (!criteria) return [];
  if (criteria.requiredFields.some((field) => profile[field] === undefined || profile[field] === null)) return ['missing_baseline_information'];
  if (criteria.minRecentWeeklyMinutes !== undefined && (profile.recentWeeklyMinutes ?? -1) < criteria.minRecentWeeklyMinutes) return ['baseline_incompatible'];
  if (criteria.maxRecentWeeklyMinutes !== undefined && (profile.recentWeeklyMinutes ?? Infinity) > criteria.maxRecentWeeklyMinutes) return ['baseline_incompatible'];
  if (criteria.minComfortableDurationMinutes !== undefined && (profile.comfortableDurationMinutes ?? -1) < criteria.minComfortableDurationMinutes) return ['baseline_incompatible'];
  if (criteria.maxComfortableDurationMinutes !== undefined && (profile.comfortableDurationMinutes ?? Infinity) > criteria.maxComfortableDurationMinutes) return ['baseline_incompatible'];
  if (criteria.allowedInterruptionStatuses && !criteria.allowedInterruptionStatuses.includes(profile.interruptionStatus ?? 'unknown')) return ['baseline_incompatible'];
  return [];
}

export function selectTemplate(request: PlanningRequest, templates: PlanTemplate[], policies: RuleConfig[]): TemplateSelection | null {
  const candidates = templates.flatMap((template) => { const policy = policies.find((item) => item.id === template.ruleConfigId); if (!policy || !contentModeAllowed(request, template) || (request.templateMode === 'real' && (policy.demoOnly || policy.reviewState !== 'reviewed' || !policy.reviewer || !policy.reviewDate || !template.reviewer || !template.reviewDate || !template.sourceUrls?.length || template.contentStatus !== 'reviewed')) || !goalMatches(request.goal, template) || validateTemplate(template, policy).length > 0 || assessBaseline(request.profile, template.baselineCompatibility).length > 0 || !choosePattern(template, request.availability)) return []; const baseline = `${request.profile.recentWeeklyMinutes ?? 'unknown'} recent weekly minutes, ${request.profile.recentLongestSessionMinutes ?? 'unknown'}-minute longest session, and ${request.profile.comfortableDurationMinutes ?? 'unknown'}-minute comfortable duration`; return [{ template, policy, explanation: `Selected the ${template.supportedGoal.replaceAll('_', ' ')} ${template.frequencyVariantId ?? `${template.trainingFrequencyPerWeek}-day`} structure because it accepts ${baseline} and the schedule passes the declared constraints.` }]; });
  return candidates.filter(({ template, policy }) => generatePlan(request, template, policy).kind === 'preview').sort((left, right) => compareCompatibility(left.template, right.template) || left.template.id.localeCompare(right.template.id) || left.template.semanticVersion.localeCompare(right.template.semanticVersion))[0] ?? null;
}

export function generatePlan(request: PlanningRequest, template: PlanTemplate, policy: RuleConfig): GenerationResult {
  const templateReasons = validateTemplate(template, policy); if (templateReasons.length) return infeasible(templateReasons);
  const baselineReasons = assessBaseline(request.profile, template.baselineCompatibility); if (baselineReasons.length) return infeasible(baselineReasons);
  if (!goalMatches(request.goal, template)) return infeasible(['no_compatible_template']);
  if (request.templateMode === 'real' && (template.demoOnly || template.reviewState !== 'reviewed')) return infeasible([template.demoOnly ? 'demo_content_only' : 'unreviewed_content']);
  if (request.templateMode === 'real' && (policy.demoOnly || policy.reviewState !== 'reviewed' || !template.reviewer || !template.reviewDate || !policy.reviewer || !policy.reviewDate || !template.sourceUrls?.length || template.contentStatus !== 'reviewed')) return infeasible(['unreviewed_content']);
  // The legacy scheduler does not yet consume the structured policy contract.
  // Reviewed labels alone cannot establish that required policy checks passed.
  if (request.templateMode === 'real') return infeasible(['structured_validation_unavailable']);
  if (template.phases.some((phase) => (phase.weeklySessions ?? [phase.sessions]).some((week) => week.some((session) => session.target?.kind === 'distance_meters' || session.steps.some((step) => step.target?.kind === 'distance_meters'))))) return infeasible(['distance_target_unsupported']);
  const dateReasons = validateGoal(request.goal, template); if (dateReasons.length) return infeasible(dateReasons);
  const patterns = compatiblePatterns(template, request.availability); if (!patterns.length) return infeasible(['availability_pattern_incompatible']);
  const attempts = patterns.map((pattern) => { const sessions = scheduleSessions(template, request.goal, pattern); return { pattern, sessions, constraints: validatePlanConstraints(sessions, request.availability, policy) }; });
  const valid = attempts.find((attempt) => attempt.constraints.length === 0);
  if (!valid) return infeasible(attempts.flatMap((attempt) => attempt.constraints));
  const { pattern, sessions } = valid;
  const goalName = template.supportedGoal === '5k_completion' ? '5K' : template.supportedGoal === '10k_completion' ? '10K' : 'half-marathon';
  const selectionExplanation = `This synthetic ${goalName} demo was selected using ${request.profile.recentWeeklyMinutes ?? 'unknown'} recent weekly minutes, a ${request.profile.recentLongestSessionMinutes ?? 'unknown'}-minute longest session, and a ${request.profile.comfortableDurationMinutes ?? 'unknown'}-minute comfortable duration. The fixture has no reviewed baseline-specific prescription variants, so these values establish compatibility but do not change workout doses.`;
  const provenance = (item: PlanTemplate | RuleConfig) => ({ author: item.author, reviewer: item.reviewer, reviewDate: item.reviewDate, rightsSourceNotes: item.rightsSourceNotes, reviewState: item.reviewState, demoOnly: item.demoOnly });
  const preview: PlanPreview = { templateId: template.id, templateVersion: template.semanticVersion, ruleVersion: policy.semanticVersion, provenance: { template: provenance(template), policy: provenance(policy), sourceUrls: [...(template.sourceUrls ?? [])] }, mode: request.templateMode, inputFingerprint: fingerprint({ request, template: [template.id, template.semanticVersion], policy: [policy.id, policy.semanticVersion], pattern }), sessions, schedulePattern: pattern, selectionExplanation, warnings: template.demoOnly ? ['demo_content_only'] : [] };
  return { kind: 'preview', preview };
}

/**
 * Creates one rolling seven-day demo window without generating later weeks.
 * The selected prescriptions still come from versioned authored fixture content;
 * this path does not derive new doses or treat the fixture as reviewed coaching.
 */
export function generateWeeklyDemoPlan(request: PlanningRequest, template: PlanTemplate, policy: RuleConfig): GenerationResult {
  const templateReasons = validateTemplate(template, policy); if (templateReasons.length) return infeasible(templateReasons);
  const baselineReasons = assessBaseline(request.profile, template.baselineCompatibility); if (baselineReasons.length) return infeasible(baselineReasons);
  if (!goalMatches(request.goal, template)) return infeasible(['no_compatible_template']);
  if (request.templateMode !== 'demo' || !template.demoOnly) return infeasible(['unreviewed_content']);
  if (request.goal.mode === 'fixed_date' && (!request.goal.raceDate || request.goal.raceDate <= request.goal.startDate)) return infeasible(['fixed_date_incompatible']);
  const firstWeek = template.phases[0]?.weeklySessions?.[0] ?? template.phases[0]?.sessions;
  if (!firstWeek || firstWeek.length !== template.trainingFrequencyPerWeek) return infeasible(['invalid_content']);
  if (firstWeek.some((session) => session.target?.kind === 'distance_meters' || session.steps.some((step) => step.target?.kind === 'distance_meters'))) return infeasible(['distance_target_unsupported']);
  const patterns = compatiblePatterns(template, request.availability);
  if (!patterns.length) return infeasible(['availability_pattern_incompatible']);
  const attempts = patterns.map((pattern) => ({ pattern, sessions: scheduleWeeklySessions(template, request.goal, pattern, firstWeek) }));
  const valid = attempts.find(({ sessions }) => validatePlanConstraints(sessions, request.availability, policy).length === 0);
  if (!valid) return infeasible(attempts.flatMap(({ sessions }) => validatePlanConstraints(sessions, request.availability, policy)));
  const goalName = template.supportedGoal === '5k_completion' ? '5K' : template.supportedGoal === '10k_completion' ? '10K' : 'half-marathon';
  const selectionExplanation = `This first seven-day ${goalName} demo uses the entered availability and the first authored fixture week. No later workouts were generated, and the fixture is not reviewed coaching advice.`;
  const contentProvenance = (item: PlanTemplate | RuleConfig) => ({ author: item.author, reviewer: item.reviewer, reviewDate: item.reviewDate, rightsSourceNotes: item.rightsSourceNotes, reviewState: item.reviewState, demoOnly: item.demoOnly });
  return { kind: 'preview', preview: { templateId: template.id, templateVersion: template.semanticVersion, ruleVersion: policy.semanticVersion, provenance: { template: contentProvenance(template), policy: contentProvenance(policy), sourceUrls: [...(template.sourceUrls ?? [])] }, mode: 'demo', inputFingerprint: fingerprint({ scope: 'rolling-seven-day-demo', request, template: [template.id, template.semanticVersion], policy: [policy.id, policy.semanticVersion], pattern: valid.pattern }), sessions: valid.sessions, schedulePattern: valid.pattern, selectionExplanation, warnings: ['demo_content_only'] } };
}

export function validatePlanConstraints(sessions: GeneratedSession[], availability: PlanningAvailability, policy: RuleConfig): PlanningReasonCode[] {
  const reasons: PlanningReasonCode[] = []; const byWeek = new Map<number, GeneratedSession[]>(); const ordered = [...sessions].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.role.localeCompare(b.role));
  for (const session of ordered) { const limit = availability.weekdayMinuteLimits[weekday(session.plannedDate)]; if (!limit || session.durationSeconds > limit * 60) reasons.push('day_time_limit_exceeded'); if (availability.unavailableDates.includes(session.plannedDate)) reasons.push('unavailable_date_conflict'); const timedSteps = session.steps.filter((step) => step.durationSeconds !== undefined); if (timedSteps.length > 0 && timedSteps.reduce((total, step) => total + (step.durationSeconds ?? 0), 0) !== session.durationSeconds) reasons.push('step_duration_mismatch'); const weekSessions = byWeek.get(session.week) ?? []; weekSessions.push(session); byWeek.set(session.week, weekSessions); }
  for (let index = 1; index < ordered.length; index += 1) if (calendarGap(ordered[index - 1].plannedDate, ordered[index].plannedDate) <= policy.minRecoveryDaysBetweenRuns) reasons.push('spacing_violation');
  let previousLong: GeneratedSession | undefined;
  for (const weekSessions of [...byWeek.entries()].sort(([left], [right]) => left - right).map(([, values]) => values)) { if (weekSessions.reduce((total, session) => total + session.durationSeconds, 0) > policy.maxWeeklyDurationSeconds) reasons.push('weekly_load_violation'); const long = weekSessions.find((session) => session.role === 'long'); if (long && previousLong && long.durationSeconds - previousLong.durationSeconds > policy.maxLongRunIncreaseSeconds) reasons.push('long_run_progression_violation'); if (long) previousLong = long; }
  return unique(reasons);
}

export function chooseSessionParameters(fallback: SessionBlueprint[], authoredWeek?: SessionBlueprint[]): SessionBlueprint[] { return authoredWeek ?? fallback; }
export function scheduleSessions(template: PlanTemplate, goal: PlanningGoal, pattern: number[]): GeneratedSession[] { const result: GeneratedSession[] = []; let week = 1; for (const phase of template.phases) for (let phaseWeek = 0; phaseWeek < phase.weeks; phaseWeek += 1) { const weekStart = addCalendarDays(goal.startDate, (week - 1) * 7); const sessions = chooseSessionParameters(phase.sessions, phase.weeklySessions?.[phaseWeek]); sessions.forEach((session, index) => { const plannedDate = nextWeekday(weekStart, pattern[index]); result.push({ id: `${template.id}:w${week}:${session.role}`, logicalKey: `w${week}:${session.role}`, week, plannedDate, phase: phase.name, role: session.role, durationSeconds: session.durationSeconds, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives }); }); week += 1; } return result.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.role.localeCompare(b.role)); }
function scheduleWeeklySessions(template: PlanTemplate, goal: PlanningGoal, pattern: number[], sessions: SessionBlueprint[]): GeneratedSession[] { return sessions.map((session, index) => ({ id: `${template.id}:rolling-w1:${session.role}`, logicalKey: `rolling-w1:${session.role}`, week: 1, plannedDate: nextWeekday(goal.startDate, pattern[index]), phase: template.phases[0].name, role: session.role, durationSeconds: session.durationSeconds, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives })).sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.role.localeCompare(right.role)); }
function contentModeAllowed(request: PlanningRequest, template: PlanTemplate): boolean { return request.templateMode === 'demo' ? template.demoOnly : !template.demoOnly && template.reviewState === 'reviewed'; }
function compareCompatibility(left: PlanTemplate, right: PlanTemplate): number { const fields: (keyof BaselineCompatibility)[] = ['allowedInterruptionStatuses', 'minRecentWeeklyMinutes', 'maxRecentWeeklyMinutes', 'minComfortableDurationMinutes', 'maxComfortableDurationMinutes']; for (const field of fields) { const difference = Number(right.baselineCompatibility?.[field] !== undefined) - Number(left.baselineCompatibility?.[field] !== undefined); if (difference) return difference; } return (right.baselineCompatibility?.requiredFields.length ?? 0) - (left.baselineCompatibility?.requiredFields.length ?? 0); }
function goalMatches(goal: PlanningGoal, template: PlanTemplate): boolean { return template.supportedGoal === '5k_completion' && goal.distanceMeters === 5000 || template.supportedGoal === '10k_completion' && goal.distanceMeters === 10000 || template.supportedGoal === 'half_marathon_completion' && goal.distanceMeters === 21097; }
function validateGoal(goal: PlanningGoal, template: PlanTemplate): PlanningReasonCode[] { if (goal.mode === 'fixed_date' && (!goal.raceDate || goal.raceDate <= goal.startDate)) return ['fixed_date_incompatible']; const end = addCalendarDays(goal.startDate, template.authoredDurationWeeks * 7); return goal.mode === 'fixed_date' && goal.raceDate !== end ? ['fixed_date_incompatible'] : []; }
function compatiblePatterns(template: PlanTemplate, availability: PlanningAvailability): number[][] { return template.allowedWeeklyPatterns.filter((pattern) => pattern.every((day) => Boolean(availability.weekdayMinuteLimits[day])) && (availability.preferredLongRunDay === null || pattern.at(-1) === availability.preferredLongRunDay)).sort((a, b) => a.join(',').localeCompare(b.join(','))); }
function choosePattern(template: PlanTemplate, availability: PlanningAvailability): number[] | null { return compatiblePatterns(template, availability)[0] ?? null; }
function calendarGap(left: string, right: string): number { const cursor = new Date(`${left}T00:00:00Z`); const end = new Date(`${right}T00:00:00Z`); let days = 0; while (cursor < end) { cursor.setUTCDate(cursor.getUTCDate() + 1); days += 1; } return days; }
function unique(values: PlanningReasonCode[]): PlanningReasonCode[] { return [...new Set(values)].sort(); }
function infeasible(reasonCodes: PlanningReasonCode[]): GenerationResult { return { kind: 'infeasible', reasonCodes: unique(reasonCodes) }; }
