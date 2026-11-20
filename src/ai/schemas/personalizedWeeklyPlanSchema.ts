import { addCalendarDays, requireDateOnly, weekday } from '@/domain/calendar/operations';

export type PersonalizedWorkoutType = 'walk_run' | 'easy_run' | 'long_run' | 'interval' | 'tempo' | 'recovery_run' | 'rest';
export type PersonalizedStepKind = 'warmup' | 'main' | 'recovery' | 'cooldown' | 'walk';
export type PersonalizedTarget = { kind: 'duration_minutes' | 'distance_meters'; value: number };
export type PersonalizedStep = { kind: PersonalizedStepKind; target: PersonalizedTarget; repeatCount: number; effortCue: string; purpose: string };
export type PersonalizedDay = {
  date: string; type: PersonalizedWorkoutType; policyRuleId: string | null; purpose: string;
  totalDurationMinutes: number | null; totalDistanceMeters: number | null; effortCue: string | null;
  paceTargetSecondsPerKm: number | null; steps: PersonalizedStep[]; coachingExplanation: string;
};

export type NumericRange = { min: number; max: number; step: number };
export type PolicyStepRule = { kind: PersonalizedStepKind; targetKind: PersonalizedTarget['kind']; range: NumericRange; minRepeats: number; maxRepeats: number };
export type PolicyWorkoutRule = {
  id: string; type: Exclude<PersonalizedWorkoutType, 'rest'>; purpose: string; allowedEfforts: string[];
  durationMinutes: NumericRange | null; distanceMeters: NumericRange | null;
  distanceSessionMinutes: NumericRange | null; requiredStepKinds: PersonalizedStepKind[]; stepRules: PolicyStepRule[];
};
export type PersonalizedTrainingPolicy = {
  id: string; version: string; reviewed: boolean; reviewer: string | null; reviewDate: string | null;
  /** Draft policies are permitted only for visibly labelled development previews. */
  contentStatus?: 'draft' | 'reviewed';
  minRunDays?: number; maxRunDays: number; maxRunMinutes: number; minimumRecoveryDays: number; minLongRuns?: number; maxLongRuns: number;
  paceTargetsAllowed: boolean; workoutRules: PolicyWorkoutRule[];
};
export type PersonalizedWeeklyInput = {
  schemaVersion: 'personalized-weekly-input-v1'; weekStartDate: string; timezone: string;
  runnerProfileFingerprint: string;
  runner: Record<string, unknown>;
  goal: { kind: string; distanceMeters: number | null; targetTimeSeconds: number | null; raceDate: string | null };
  trainingState: { phase: string; weekNumber: number; recentLoad: Record<string, unknown>; previousOutcomes: Record<string, unknown>[] };
  availability: { runWeekdays: number[]; maxSessionMinutesByWeekday: Record<number, number>; unavailableDates: string[] };
  paceEvidence: { reliable: boolean; source: 'runsensei_native' | 'user_reported' | 'none'; referenceSecondsPerKm: number | null };
  generationMode?: 'production' | 'development_preview';
  policy: PersonalizedTrainingPolicy;
};
export type PersonalizedWeeklyPlan = {
  schemaVersion: 'personalized-weekly-plan-v1'; weekNumber: number; startDate: string; goalSummary: string;
  assumptions: string[]; safetyNotes: string[]; days: PersonalizedDay[];
};

const targetSchema = { type: 'object', additionalProperties: false, required: ['kind', 'value'], properties: { kind: { type: 'string', enum: ['duration_minutes', 'distance_meters'] }, value: { type: 'integer', minimum: 1 } } } as const;
export const PERSONALIZED_WEEKLY_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'weekNumber', 'startDate', 'goalSummary', 'assumptions', 'safetyNotes', 'days'],
  properties: {
    schemaVersion: { type: 'string', const: 'personalized-weekly-plan-v1' }, weekNumber: { type: 'integer', minimum: 1 }, startDate: { type: 'string' }, goalSummary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } }, safetyNotes: { type: 'array', items: { type: 'string' } },
    days: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', additionalProperties: false,
      required: ['date', 'type', 'policyRuleId', 'purpose', 'totalDurationMinutes', 'totalDistanceMeters', 'effortCue', 'paceTargetSecondsPerKm', 'steps', 'coachingExplanation'],
      properties: {
        date: { type: 'string' }, type: { type: 'string', enum: ['walk_run', 'easy_run', 'long_run', 'interval', 'tempo', 'recovery_run', 'rest'] }, policyRuleId: { type: ['string', 'null'] }, purpose: { type: 'string' },
        totalDurationMinutes: { type: ['integer', 'null'], minimum: 0 }, totalDistanceMeters: { type: ['integer', 'null'], minimum: 0 }, effortCue: { type: ['string', 'null'] }, paceTargetSecondsPerKm: { type: ['integer', 'null'], minimum: 1 }, coachingExplanation: { type: 'string' },
        steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'target', 'repeatCount', 'effortCue', 'purpose'], properties: { kind: { type: 'string', enum: ['warmup', 'main', 'recovery', 'cooldown', 'walk'] }, target: targetSchema, repeatCount: { type: 'integer', minimum: 1 }, effortCue: { type: 'string' }, purpose: { type: 'string' } } } },
      },
    } },
  },
} as const;

export class PersonalizedPlanValidationError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'PersonalizedPlanValidationError'; } }
function requireValue(condition: unknown, code: string, message: string): asserts condition { if (!condition) throw new PersonalizedPlanValidationError(code, message); }
const inRange = (value: number, range: NumericRange) => Number.isInteger(value) && value >= range.min && value <= range.max && (value - range.min) % range.step === 0;
const runningTypes = new Set<PersonalizedWorkoutType>(['walk_run', 'easy_run', 'long_run', 'interval', 'tempo', 'recovery_run']);

export function parsePersonalizedWeeklyPlan(text: string): PersonalizedWeeklyPlan { try { return JSON.parse(text) as PersonalizedWeeklyPlan; } catch { throw new PersonalizedPlanValidationError('malformed_json', 'The local model returned malformed JSON.'); } }

export function validatePersonalizedWeeklyPlan(plan: PersonalizedWeeklyPlan, input: PersonalizedWeeklyInput): PersonalizedWeeklyPlan {
  const policy = input.policy;
  const developmentPreview = input.generationMode === 'development_preview';
  requireValue((policy.reviewed && Boolean(policy.reviewer) && Boolean(policy.reviewDate)) || (developmentPreview && policy.contentStatus === 'draft'), 'no_reviewed_policy', 'A reviewed numerical policy is required outside clearly labelled development previews.');
  requireValue(plan?.schemaVersion === 'personalized-weekly-plan-v1' && plan.startDate === input.weekStartDate && plan.weekNumber === input.trainingState.weekNumber, 'invalid_week', 'The generated week metadata does not match the request.');
  requireValue(Array.isArray(plan.days) && plan.days.length === 7, 'wrong_day_count', 'The proposal must contain exactly seven days.');
  const rules = new Map(policy.workoutRules.map((rule) => [rule.id, rule]));
  let runDays = 0; let runMinutes = 0; let longRuns = 0; let previousRunIndex: number | null = null;
  plan.days.forEach((day, index) => {
    const expectedDate = addCalendarDays(requireDateOnly(input.weekStartDate), index);
    requireValue(day.date === expectedDate, 'nonconsecutive_dates', 'Every consecutive date must appear exactly once.');
    if (day.type === 'rest') {
      requireValue(day.policyRuleId === null && day.steps.length === 0 && day.totalDurationMinutes === 0 && day.totalDistanceMeters === 0 && day.effortCue === null && day.paceTargetSecondsPerKm === null, 'invalid_rest', 'Rest days cannot contain a prescription.');
      return;
    }
    requireValue(runningTypes.has(day.type), 'unsupported_workout_type', 'The proposal contains an unsupported workout type.');
    const rule = day.policyRuleId ? rules.get(day.policyRuleId) : undefined;
    requireValue(rule && rule.type === day.type, 'unsupported_workout_rule', 'The proposal did not use an approved workout rule.');
    const dayOfWeek = weekday(requireDateOnly(day.date));
    requireValue(input.availability.runWeekdays.includes(dayOfWeek) && !input.availability.unavailableDates.includes(day.date), 'unavailable_day', 'A workout is scheduled when the runner is unavailable.');
    requireValue(day.paceTargetSecondsPerKm === null || policy.paceTargetsAllowed && input.paceEvidence.reliable && input.paceEvidence.referenceSecondsPerKm !== null, 'unsupported_pace_target', 'A pace target requires reliable evidence and an approved pace policy.');
    requireValue(rule.allowedEfforts.includes(day.effortCue ?? ''), 'unsupported_effort', 'The effort cue is outside the approved rule.');
    requireValue(rule.requiredStepKinds.every((kind) => day.steps.some((step) => step.kind === kind)), 'missing_step', 'The proposal omitted a required workout component.');
    for (const step of day.steps) {
      const stepRule = rule.stepRules.find((candidate) => candidate.kind === step.kind && candidate.targetKind === step.target.kind);
      requireValue(stepRule && inRange(step.target.value, stepRule.range) && Number.isInteger(step.repeatCount) && step.repeatCount >= stepRule.minRepeats && step.repeatCount <= stepRule.maxRepeats, 'step_out_of_bounds', 'A workout step is outside the reviewed bounds.');
    }
    const durationTotal = day.steps.filter((step) => step.target.kind === 'duration_minutes').reduce((total, step) => total + step.target.value * step.repeatCount, 0);
    const distanceTotal = day.steps.filter((step) => step.target.kind === 'distance_meters').reduce((total, step) => total + step.target.value * step.repeatCount, 0);
    if (rule.durationMinutes) {
      requireValue(day.totalDistanceMeters === 0 && day.totalDurationMinutes !== null && inRange(day.totalDurationMinutes, rule.durationMinutes) && durationTotal === day.totalDurationMinutes && distanceTotal === 0, 'duration_total_mismatch', 'Duration steps do not reconcile with the session total.');
    } else {
      requireValue(rule.distanceMeters && rule.distanceSessionMinutes && day.totalDistanceMeters !== null && day.totalDurationMinutes !== null && inRange(day.totalDistanceMeters, rule.distanceMeters) && inRange(day.totalDurationMinutes, rule.distanceSessionMinutes) && distanceTotal === day.totalDistanceMeters, 'distance_total_mismatch', 'Distance work or its authored time budget is invalid.');
    }
    const sessionMinutes = day.totalDurationMinutes ?? 0; const dayLimit = input.availability.maxSessionMinutesByWeekday[dayOfWeek];
    requireValue(Number.isFinite(dayLimit) && sessionMinutes <= dayLimit, 'session_limit', 'A workout exceeds the available session time.');
    runDays += 1; runMinutes += sessionMinutes; if (day.type === 'long_run') longRuns += 1;
    if (previousRunIndex !== null) requireValue(index - previousRunIndex - 1 >= policy.minimumRecoveryDays, 'recovery_spacing', 'The proposal violates reviewed recovery spacing.');
    previousRunIndex = index;
  });
  requireValue(runDays >= (policy.minRunDays ?? 0) && runDays <= Math.min(policy.maxRunDays, input.availability.runWeekdays.length), 'frequency_limit', 'The proposal does not match the approved running-day range.');
  requireValue(runMinutes <= policy.maxRunMinutes, 'weekly_load_limit', 'The proposal exceeds the reviewed weekly load limit.');
  requireValue(longRuns >= (policy.minLongRuns ?? 0) && longRuns <= policy.maxLongRuns, 'long_run_limit', 'The proposal does not match the approved long-session range.');
  return plan;
}
