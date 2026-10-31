export const GEMINI_MODEL = 'gemini-3.8-flash';
export const WEEKLY_INPUT_VERSION = 'weekly-input-v1';
export const WEEKLY_PLAN_VERSION = 'weekly-plan-v1';
export const WEEKLY_PROMPT_VERSION = 'weekly-coach-v1';

export type TrustedSource = 'runsensei_native' | 'user_direct' | 'coach_reviewed';
export type WorkoutType = 'easy_run' | 'long_run' | 'interval' | 'recovery_run' | 'cross_training' | 'rest';

export interface RunnerQuestionnaire {
  source: 'user_direct';
  timezone: string;
  goal: { kind: string; targetTimeSeconds: number | null };
  experience: string;
  maxRunDays: number;
  maxMinutesPerSession: number;
  availableWeekdays: number[];
  currentPain: boolean;
  illnessNow: boolean;
  restrictionNeedsReview: boolean;
  consentVersion: string;
}

export interface NativeRunSummary {
  source: TrustedSource;
  derivedFrom?: TrustedSource[];
  date: string;
  distanceM: number | null;
  activeSeconds: number | null;
}

export interface AllowedSegment {
  phase: 'warmup' | 'work' | 'recovery' | 'cooldown';
  minutes: number;
  description: string;
}

export interface AllowedWorkoutTemplate {
  id: string;
  type: WorkoutType;
  durationMinutes: number;
  intensity: string;
  segments: AllowedSegment[];
}

export interface ReviewedWeeklyPolicy {
  id: string;
  version: string;
  status: 'reviewed';
  maxRunMinutes: number;
  allowedTemplates: AllowedWorkoutTemplate[];
}

export interface WeeklyPlannerInput {
  schemaVersion: typeof WEEKLY_INPUT_VERSION;
  weekStartDate: string;
  timezone: string;
  goal: RunnerQuestionnaire['goal'];
  experience: string;
  availability: {
    runWeekdays: number[];
    maxRunDays: number;
    maxSessionMinutes: number;
  };
  recentRuns: NativeRunSummary[];
  policy: {
    id: string;
    version: string;
    maxRunMinutes: number;
    allowedTemplates: AllowedWorkoutTemplate[];
  };
}

export interface WeeklyPlanDay {
  date: string;
  type: WorkoutType;
  templateId: string;
  durationMinutes: number;
  intensity: string;
  segments: AllowedSegment[];
  rationale: string;
}

export interface WeeklyPlanProposal {
  schemaVersion: typeof WEEKLY_PLAN_VERSION;
  startDate: string;
  goalSummary: string;
  assumptions: string[];
  days: WeeklyPlanDay[];
  safetyNotes: string[];
}

export class WeeklyPlannerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'WeeklyPlannerError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SOURCES = new Set<TrustedSource>(['runsensei_native', 'user_direct', 'coach_reviewed']);
const RUN_TYPES = new Set<WorkoutType>(['easy_run', 'long_run', 'interval', 'recovery_run']);

function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new WeeklyPlannerError(code, message);
}

export function addCalendarDays(date: string, days: number): string {
  assert(ISO_DATE.test(date), 'invalid_date', 'Date must use YYYY-MM-DD.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date, 'invalid_date', 'Date is not a real calendar date.');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function sameSegments(actual: AllowedSegment[], expected: AllowedSegment[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => {
    const target = expected[index];
    return segment.phase === target.phase
      && segment.minutes === target.minutes
      && segment.description === target.description;
  });
}

export function buildWeeklyPlannerInput(
  profile: RunnerQuestionnaire,
  nativeRuns: NativeRunSummary[],
  policy: ReviewedWeeklyPolicy,
  weekStartDate: string,
): WeeklyPlannerInput {
  addCalendarDays(weekStartDate, 0);
  assert(profile?.source === 'user_direct', 'untrusted_profile', 'Profile provenance is not trusted.');
  assert(Boolean(profile.timezone && profile.goal?.kind && profile.experience && profile.consentVersion), 'missing_profile', 'Required questionnaire fields are missing.');
  assert(Number.isInteger(profile.maxRunDays) && profile.maxRunDays >= 0 && profile.maxRunDays <= 7, 'invalid_availability', 'Available run-day count is invalid.');
  assert(Number.isInteger(profile.maxMinutesPerSession) && profile.maxMinutesPerSession >= 0, 'invalid_availability', 'Per-session time limit is invalid.');
  assert(Array.isArray(profile.availableWeekdays) && profile.availableWeekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7), 'invalid_availability', 'Available weekdays are invalid.');
  assert(!profile.currentPain && !profile.illnessNow && !profile.restrictionNeedsReview, 'health_review_required', 'A health review is required before automatic planning.');
  assert(policy?.status === 'reviewed', 'no_reviewed_policy', 'No reviewed weekly training policy is available.');
  assert(isNonnegativeInteger(policy.maxRunMinutes), 'invalid_policy', 'Reviewed weekly cap is invalid.');
  assert(Array.isArray(policy.allowedTemplates) && policy.allowedTemplates.length > 0, 'invalid_policy', 'Reviewed workout templates are missing.');

  for (const run of nativeRuns) {
    assert(ALLOWED_SOURCES.has(run?.source), 'disallowed_provenance', 'Unverified or restricted activity provenance was rejected.');
    assert(!run.derivedFrom || run.derivedFrom.every((source) => ALLOWED_SOURCES.has(source)), 'disallowed_provenance', 'Restricted derived activity provenance was rejected.');
  }

  return {
    schemaVersion: WEEKLY_INPUT_VERSION,
    weekStartDate,
    timezone: profile.timezone,
    goal: profile.goal,
    experience: profile.experience,
    availability: {
      runWeekdays: [...new Set(profile.availableWeekdays)].sort((a, b) => a - b),
      maxRunDays: profile.maxRunDays,
      maxSessionMinutes: profile.maxMinutesPerSession,
    },
    recentRuns: nativeRuns.map(({ source, derivedFrom, date, distanceM, activeSeconds }) => ({ source, derivedFrom, date, distanceM, activeSeconds })),
    policy: {
      id: policy.id,
      version: policy.version,
      maxRunMinutes: policy.maxRunMinutes,
      allowedTemplates: structuredClone(policy.allowedTemplates),
    },
  };
}

export function validateWeeklyPlan(plan: WeeklyPlanProposal, input: WeeklyPlannerInput): { runDays: number; runMinutes: number } {
  assert(plan?.schemaVersion === WEEKLY_PLAN_VERSION, 'invalid_schema', 'Weekly plan schema version is unsupported.');
  assert(plan.startDate === input.weekStartDate, 'wrong_start_date', 'Plan start date does not match the request.');
  assert(Array.isArray(plan.days) && plan.days.length === 7, 'wrong_day_count', 'Plan must contain exactly seven days.');
  assert(Array.isArray(plan.assumptions) && Array.isArray(plan.safetyNotes) && typeof plan.goalSummary === 'string', 'invalid_schema', 'Plan summary fields are invalid.');

  const templates = new Map(input.policy.allowedTemplates.map((template) => [template.id, template]));
  const seen = new Set<string>();
  let runDays = 0;
  let runMinutes = 0;

  plan.days.forEach((day, index) => {
    const expectedDate = addCalendarDays(input.weekStartDate, index);
    assert(day?.date === expectedDate && !seen.has(day.date), 'nonconsecutive_dates', 'Plan dates must be unique and consecutive.');
    seen.add(day.date);
    const template = templates.get(day.templateId);
    assert(template, 'unknown_template', 'Plan used a workout that is not in the reviewed allowlist.');
    assert(day.type === template.type && day.durationMinutes === template.durationMinutes && day.intensity === template.intensity, 'template_changed', 'Plan changed a reviewed workout prescription.');
    assert(Array.isArray(day.segments) && sameSegments(day.segments, template.segments), 'template_changed', 'Plan changed reviewed workout steps.');
    assert(typeof day.rationale === 'string' && day.rationale.length > 0, 'invalid_rationale', 'Each day requires a brief rationale.');
    assert(isNonnegativeInteger(day.durationMinutes), 'invalid_duration', 'Workout duration is invalid.');

    const segmentMinutes = day.segments.reduce((sum, segment) => sum + segment.minutes, 0);
    assert(segmentMinutes === day.durationMinutes, 'segment_total_mismatch', 'Workout segments do not match the session duration.');
    if (day.type === 'rest') {
      assert(day.durationMinutes === 0 && day.segments.length === 0, 'invalid_rest_day', 'Rest days cannot contain prescribed exercise.');
    } else {
      assert(day.durationMinutes <= input.availability.maxSessionMinutes, 'session_limit_exceeded', 'Workout exceeds the available session time.');
    }
    if (RUN_TYPES.has(day.type)) {
      assert(input.availability.runWeekdays.includes(weekday(day.date)), 'unavailable_weekday', 'Running was scheduled on an unavailable weekday.');
      runDays += 1;
      runMinutes += day.durationMinutes;
    }
  });

  assert(runDays <= input.availability.maxRunDays, 'run_day_limit_exceeded', 'Plan exceeds the available running days.');
  assert(runMinutes <= input.policy.maxRunMinutes, 'weekly_limit_exceeded', 'Plan exceeds the reviewed weekly running cap.');
  return { runDays, runMinutes };
}

export const WEEKLY_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'startDate', 'goalSummary', 'assumptions', 'days', 'safetyNotes'],
  properties: {
    schemaVersion: { type: 'string', enum: [WEEKLY_PLAN_VERSION] },
    startDate: { type: 'string' },
    goalSummary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    safetyNotes: { type: 'array', items: { type: 'string' } },
    days: {
      type: 'array', minItems: 7, maxItems: 7,
      items: {
        type: 'object', additionalProperties: false,
        required: ['date', 'type', 'templateId', 'durationMinutes', 'intensity', 'segments', 'rationale'],
        properties: {
          date: { type: 'string' },
          type: { type: 'string', enum: ['easy_run', 'long_run', 'interval', 'recovery_run', 'cross_training', 'rest'] },
          templateId: { type: 'string' },
          durationMinutes: { type: 'integer', minimum: 0 },
          intensity: { type: 'string' },
          rationale: { type: 'string' },
          segments: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['phase', 'minutes', 'description'],
              properties: {
                phase: { type: 'string', enum: ['warmup', 'work', 'recovery', 'cooldown'] },
                minutes: { type: 'integer', minimum: 0 },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const WEEKLY_COACH_SYSTEM_PROMPT = `You are RunSensei's constrained ONE-WEEK plan composer.
Return exactly seven consecutive local calendar dates beginning at weekStartDate, including rest days.
Choose only the supplied allowedTemplates. Copy each selected template's type, duration, intensity, and segments exactly; do not invent or modify prescriptions, pace targets, distances, progressions, or health advice.
Run only on available weekdays and remain within maxRunDays, maxSessionMinutes, and maxRunMinutes.
Treat missing facts as unknown. If pace data is absent, do not invent pace guidance.
Use brief, supportive rationales. Return only JSON matching the response schema.`;
