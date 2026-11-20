import { addCalendarDays, weekday } from '@/domain/calendar/operations';

export type SystemBPhase = 'base' | 'development' | 'race_preparation' | 'taper';
export type SystemBWorkoutType = 'walk_run' | 'easy_run' | 'recovery_run' | 'long_run' | 'tempo' | 'intervals' | 'hills' | 'time_trial';
export type SystemBPolicy = {
  id: string; version: string; status: 'draft' | 'reviewed';
  weeks: readonly { phase: SystemBPhase; weeklyMinutes: number; longRunMinutes: number; deload: boolean; allowedTypes: readonly SystemBWorkoutType[]; maxDemandingSessions: number }[];
  minimumRecoveryDays: number; frequency: number; requiredTaperWeeks: number;
};
export type SystemBInput = { startDate: string; weekNumber: number; availability: { weekdays: number[]; minuteLimits: Record<number, number>; unavailableDates: string[]; preferredLongDay: number | null }; policy: SystemBPolicy };
export type SystemBSession = { date: string; type: SystemBWorkoutType; durationMinutes: number; phase: SystemBPhase; intensity: 'easy' | 'demanding'; steps: readonly { kind: 'warmup' | 'main' | 'recovery' | 'cooldown'; minutes: number; repeats: number }[] };
export type SystemBResult = { kind: 'plan'; phase: SystemBPhase; weeklyMinutes: number; longRunMinutes: number; sessions: SystemBSession[]; reasons: string[] } | { kind: 'unavailable'; reasonCodes: string[] };

/** Pure deterministic initial-plan generator. Numerical doses are supplied only by the policy. */
export function generateSystemBWeek(input: SystemBInput): SystemBResult {
  const week = input.policy.weeks[input.weekNumber - 1];
  if (!week) return { kind: 'unavailable', reasonCodes: ['policy_week_unavailable'] };
  if (input.policy.status !== 'reviewed') return { kind: 'unavailable', reasonCodes: ['unreviewed_policy'] };
  if (input.policy.weeks.slice(-input.policy.requiredTaperWeeks).some((item) => item.phase !== 'taper')) return { kind: 'unavailable', reasonCodes: ['invalid_taper_policy'] };
  const dates = input.availability.weekdays.map((day) => ({ day, date: dateForWeekday(input.startDate, day) })).filter((item) => !input.availability.unavailableDates.includes(item.date));
  if (dates.length < input.policy.frequency) return { kind: 'unavailable', reasonCodes: ['availability_frequency_incompatible'] };
  const candidates = dates.filter((item) => input.availability.minuteLimits[item.day] > 0).sort((a, b) => a.day - b.day);
  const long = candidates.find((item) => item.day === input.availability.preferredLongDay) ?? candidates.at(-1);
  if (!long || input.availability.minuteLimits[long.day] < week.longRunMinutes) return { kind: 'unavailable', reasonCodes: ['long_run_time_limit'] };
  const selected = chooseSpaced(candidates, input.policy.frequency, input.policy.minimumRecoveryDays, long.day);
  if (!selected) return { kind: 'unavailable', reasonCodes: ['recovery_spacing_incompatible'] };
  const types = selectTypes(week, input.policy.frequency); if (!types) return { kind: 'unavailable', reasonCodes: ['workout_types_incompatible'] };
  const remaining = week.weeklyMinutes - week.longRunMinutes; if (remaining <= 0) return { kind: 'unavailable', reasonCodes: ['invalid_volume_policy'] };
  const durations = distributeMinutes(remaining, input.policy.frequency - 1, selected.filter((item) => item.day !== long.day).map((item) => input.availability.minuteLimits[item.day]));
  if (!durations) return { kind: 'unavailable', reasonCodes: ['session_time_limit'] };
  let ordinary = 0;
  const sessions = selected.map((item) => { const isLong = item.day === long.day; const type = isLong ? 'long_run' as const : types[ordinary++]; const durationMinutes = isLong ? week.longRunMinutes : durations[ordinary - 1]; return buildSession(item.date, type, durationMinutes, week.phase); }).sort((a, b) => a.date.localeCompare(b.date));
  const total = sessions.reduce((sum, item) => sum + item.durationMinutes, 0);
  if (total !== week.weeklyMinutes || sessions.filter((item) => item.intensity === 'demanding').length > week.maxDemandingSessions) return { kind: 'unavailable', reasonCodes: ['policy_constraint_failed'] };
  return { kind: 'plan', phase: week.phase, weeklyMinutes: week.weeklyMinutes, longRunMinutes: week.longRunMinutes, sessions, reasons: ['Initial session dates, minutes, and workout types were generated deterministically from the selected policy and availability.'] };
}
function dateForWeekday(start: string, target: number) { for (let offset = 0; offset < 7; offset += 1) { const date = addCalendarDays(start as `${number}-${number}-${number}`, offset); if (weekday(date) === target) return date; } throw new Error('Invalid calendar week.'); }
function chooseSpaced(days: { day: number; date: string }[], count: number, recovery: number, longDay: number) { const combinations = (start: number, chosen: typeof days): typeof days | null => { if (chosen.length === count) return chosen.some((item) => item.day === longDay) ? chosen : null; for (let i = start; i < days.length; i += 1) { const next = [...chosen, days[i]]; if (next.length > 1 && next[next.length - 1].day - next[next.length - 2].day <= recovery) continue; const found = combinations(i + 1, next); if (found) return found; } return null; }; return combinations(0, []); }
function selectTypes(week: SystemBPolicy['weeks'][number], count: number): SystemBWorkoutType[] | null { const ordinary = count - 1; const easy: SystemBWorkoutType | null = week.allowedTypes.includes('easy_run') ? 'easy_run' : week.allowedTypes.includes('walk_run') ? 'walk_run' : null; if (!easy) return null; const demanding = week.allowedTypes.find((item) => ['tempo', 'intervals', 'hills', 'time_trial'].includes(item)); const types: SystemBWorkoutType[] = Array.from({ length: ordinary }, () => easy); if (demanding && week.maxDemandingSessions > 0 && week.phase !== 'taper') types[0] = demanding; return types; }
function distributeMinutes(total: number, count: number, limits: number[]) { if (count <= 0) return []; const base = Math.floor(total / count); const values = Array.from({ length: count }, (_, index) => base + (index < total % count ? 1 : 0)); return values.every((value, index) => value > 0 && value <= limits[index]) ? values : null; }
function buildSession(date: string, type: SystemBWorkoutType, durationMinutes: number, phase: SystemBPhase): SystemBSession { const warmup = Math.min(5, Math.floor(durationMinutes / 3)); const cooldown = Math.min(5, Math.floor((durationMinutes - warmup) / 3)); const main = durationMinutes - warmup - cooldown; const demanding = ['tempo', 'intervals', 'hills', 'time_trial'].includes(type); return { date, type, durationMinutes, phase, intensity: demanding ? 'demanding' : 'easy', steps: [{ kind: 'warmup', minutes: warmup, repeats: 1 }, { kind: 'main', minutes: main, repeats: 1 }, { kind: 'cooldown', minutes: cooldown, repeats: 1 }] }; }
