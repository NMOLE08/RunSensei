import { addCalendarDays, requireDateOnly, weekday } from '@/domain/calendar/operations';

export type LocalWorkoutType = 'easy_run' | 'long_run' | 'interval' | 'recovery_run' | 'cross_training' | 'rest';
export type LocalPlanSegment = { phase: 'warmup' | 'work' | 'recovery' | 'cooldown'; minutes: number; description: string };
export type LocalAllowedTemplate = { id: string; type: LocalWorkoutType; durationMinutes: number; intensity: string; segments: LocalPlanSegment[] };
export type LocalWeeklyPlannerInput = {
  schemaVersion: 'local-weekly-input-v1'; weekStartDate: string; timezone: string;
  goal: { kind: string; targetTimeSeconds: number | null; raceDate: string | null };
  availability: { runWeekdays: number[]; maxRunDays: number; maxSessionMinutesByWeekday: Record<number, number> };
  baseline: Record<string, unknown>; recentNativeRuns: Record<string, unknown>[];
  policy: { id: string; version: string; reviewed: boolean; maxRunMinutes: number | null; allowedTemplates: LocalAllowedTemplate[] };
};
export type LocalWeeklyPlan = {
  schemaVersion: 'local-weekly-plan-v1'; startDate: string; goalSummary: string; assumptions: string[]; safetyNotes: string[];
  days: { date: string; type: LocalWorkoutType; templateId: string; durationMinutes: number; intensity: string; segments: LocalPlanSegment[]; rationale: string }[];
};

export const LOCAL_WEEKLY_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'startDate', 'goalSummary', 'assumptions', 'safetyNotes', 'days'],
  properties: {
    schemaVersion: { type: 'string', const: 'local-weekly-plan-v1' }, startDate: { type: 'string' }, goalSummary: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } }, safetyNotes: { type: 'array', items: { type: 'string' } },
    days: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', additionalProperties: false,
      required: ['date', 'type', 'templateId', 'durationMinutes', 'intensity', 'segments', 'rationale'],
      properties: { date: { type: 'string' }, type: { type: 'string', enum: ['easy_run', 'long_run', 'interval', 'recovery_run', 'cross_training', 'rest'] }, templateId: { type: 'string' }, durationMinutes: { type: 'integer', minimum: 0 }, intensity: { type: 'string' }, rationale: { type: 'string' }, segments: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['phase', 'minutes', 'description'], properties: { phase: { type: 'string', enum: ['warmup', 'work', 'recovery', 'cooldown'] }, minutes: { type: 'integer', minimum: 0 }, description: { type: 'string' } } } } },
    } },
  },
} as const;

export class LocalPlanValidationError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = 'LocalPlanValidationError'; } }
function requireValue(condition: unknown, code: string, message: string): asserts condition { if (!condition) throw new LocalPlanValidationError(code, message); }
const sameSegments = (left: LocalPlanSegment[], right: LocalPlanSegment[]) => left.length === right.length && left.every((item, index) => item.phase === right[index].phase && item.minutes === right[index].minutes && item.description === right[index].description);

export function validateLocalWeeklyPlan(plan: LocalWeeklyPlan, input: LocalWeeklyPlannerInput): LocalWeeklyPlan {
  requireValue(input.policy.reviewed, 'no_reviewed_policy', 'Reviewed training content is required.');
  requireValue(plan?.schemaVersion === 'local-weekly-plan-v1' && plan.startDate === input.weekStartDate, 'invalid_week', 'The generated week has the wrong version or start date.');
  requireValue(Array.isArray(plan.days) && plan.days.length === 7, 'wrong_day_count', 'The plan must contain exactly seven days.');
  const templates = new Map(input.policy.allowedTemplates.map((item) => [item.id, item])); let runDays = 0; let runMinutes = 0;
  plan.days.forEach((day, index) => {
    requireValue(day.date === addCalendarDays(requireDateOnly(input.weekStartDate), index), 'nonconsecutive_dates', 'The plan dates are not consecutive.');
    const template = templates.get(day.templateId); requireValue(template, 'unknown_template', 'The model selected an unapproved workout.');
    requireValue(day.type === template.type && day.durationMinutes === template.durationMinutes && day.intensity === template.intensity && sameSegments(day.segments, template.segments), 'template_changed', 'The model changed an approved workout.');
    requireValue(day.segments.reduce((sum, segment) => sum + segment.minutes, 0) === day.durationMinutes, 'segment_total_mismatch', 'Workout steps do not match the duration.');
    if (day.type === 'rest') requireValue(day.durationMinutes === 0 && day.segments.length === 0, 'invalid_rest', 'A rest day cannot contain a workout.');
    if (['easy_run', 'long_run', 'interval', 'recovery_run'].includes(day.type)) {
      const dayOfWeek = weekday(requireDateOnly(day.date)); requireValue(input.availability.runWeekdays.includes(dayOfWeek), 'unavailable_day', 'A run is scheduled on an unavailable day.');
      const limit = input.availability.maxSessionMinutesByWeekday[dayOfWeek]; requireValue(Number.isFinite(limit) && day.durationMinutes <= limit, 'session_limit', 'A workout exceeds the available time.'); runDays += 1; runMinutes += day.durationMinutes;
    }
  });
  requireValue(runDays <= input.availability.maxRunDays, 'frequency_limit', 'The plan contains too many running days.');
  requireValue(input.policy.maxRunMinutes !== null && runMinutes <= input.policy.maxRunMinutes, 'weekly_limit', 'The plan exceeds the reviewed weekly limit.');
  return plan;
}

export function parseLocalWeeklyPlan(text: string): LocalWeeklyPlan {
  try { return JSON.parse(text) as LocalWeeklyPlan; } catch { throw new LocalPlanValidationError('malformed_json', 'The local model returned malformed plan data.'); }
}
