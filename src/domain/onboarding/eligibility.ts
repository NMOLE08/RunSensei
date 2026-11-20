import { isDateOnly } from '@/domain/calendar/dateOnly';
import type { EligibilityResult, OnboardingDraft } from './types';
import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';
import type { PlanTemplate } from '@/domain/training/content';

const demoOnly = true;
const missing = (fields: string[]): EligibilityResult => ({ code: 'insufficient_information', title: 'A few details are still needed', message: 'Complete the requested baseline and goal details before we can assess the demo pathway.', fields, demoOnly });

/** Eligibility only. It never creates a plan or infers readiness from a single 5K. */
export function assessEligibility(draft: OnboardingDraft, today?: string): EligibilityResult {
  if (draft.concernFlag) return { code: 'health_hold', title: 'Pause and reassess', message: 'A concern was noted. This app cannot assess or clear it; workout recommendations stay unavailable until the reviewed reassessment path exists.', fields: ['screening'], demoOnly };
  if (draft.recentInterruption === 'sustained') return { code: 'needs_reassessment', title: 'A fresh check-in is needed', message: 'A sustained interruption needs reassessment before a future schedule can be recommended.', fields: ['interruption'], demoOnly };
  const template = supportedTemplate(draft);
  if (!template) return { code: 'unsupported_goal', title: 'This goal is not supported yet', message: 'The installed demo library does not contain a compatible structure for this goal. Choose a 5K, 10K, or half-marathon completion demo, or wait for reviewed content. The app will not substitute a different goal.', fields: ['goalKind', 'goalEvent'], demoOnly };
  const required = ['weeklyRunningMinutes', 'baselineLookbackDays', 'longestSessionMinutes', 'longestSessionDate', 'comfortableDurationMinutes', 'startDate', 'timezone'];
  const missingFields = required.filter((field) => !String(draft[field as keyof OnboardingDraft] ?? '').trim());
  if (draft.goalMode === 'fixed_date' && !draft.raceDate) missingFields.push('raceDate');
  if (![draft.weeklyRunningMinutes, draft.baselineLookbackDays, draft.longestSessionMinutes, draft.comfortableDurationMinutes].every(positiveInteger)) missingFields.push('baselineNumbers');
  if (draft.trainingDays.length === 0) missingFields.push('trainingDays');
  if (draft.preferredLongRunDay === null) missingFields.push('preferredLongRunDay');
  if (draft.recentInterruption === 'unknown') missingFields.push('interruption');
  if (draft.targetPerformanceSeconds && !positiveInteger(draft.targetPerformanceSeconds)) missingFields.push('targetPerformanceSeconds');
  if (draft.targetHorizonWeeks && !positiveInteger(draft.targetHorizonWeeks)) missingFields.push('targetHorizonWeeks');
  if (hasPartialPerformance(draft) && !validPerformance(draft)) missingFields.push('currentPerformance');
  if (missingFields.length > 0) return missing([...new Set(missingFields)]);
  if (!isDateOnly(draft.startDate) || (draft.goalMode === 'fixed_date' && !isDateOnly(draft.raceDate)) || !validUnavailableDates(draft.unavailableDates)) return missing(['dates']);
  if (!validTimezone(draft.timezone)) return missing(['timezone']);
  if (today && draft.startDate < today) return { code: 'goal_date_incompatible', title: 'Choose a current start date', message: 'The plan start date is in the past. Choose today or a future date so the demo schedule appears on the right days.', fields: ['startDate'], demoOnly };
  if (draft.goalMode === 'fixed_date' && draft.raceDate <= draft.startDate) return { code: 'goal_date_incompatible', title: 'The race date needs changing', message: 'A fixed race date must be after the chosen start date. No schedule has been compressed or created.', fields: ['raceDate', 'startDate'], demoOnly };
  if (draft.trainingDays.length !== template.trainingFrequencyPerWeek) return unavailable(`The available demo structure requires exactly ${template.trainingFrequencyPerWeek} running days. Your ${draft.trainingDays.length}-day availability has been saved, but no different frequency is invented.`, ['trainingDays']);
  if (draft.preferredLongRunDay === null || !draft.trainingDays.includes(draft.preferredLongRunDay)) return unavailable('The preferred long-run day must be one of the available running days.', ['preferredLongRunDay']);
  const patterns = template.allowedWeeklyPatterns.filter((candidate) => candidate.every((day) => draft.trainingDays.includes(day)) && candidate.at(-1) === draft.preferredLongRunDay);
  if (patterns.length === 0) return unavailable('These days cannot provide the recovery spacing required by the installed demo structure. Choose three supported days with recovery between runs.', ['trainingPattern']);
  if (!patterns.some((pattern) => fitsAllAuthoredSessions(template, pattern, draft))) return unavailable('At least one demo workout exceeds the maximum time entered for its day. Increase only a genuinely available limit or choose another supported schedule.', ['minuteLimits']);
  if (!draft.assumptionsConfirmed) return missing(['assumptionsConfirmed']);
  return { code: 'eligible', title: 'Your demo schedule is ready', message: 'The app used your goal and the baseline facts you entered to select a compatible synthetic demo structure. It did not require you to match a hidden preset. Reviewed training content is still required before this can be presented as coaching advice.', fields: [], demoOnly };
}

function positiveInteger(value: string | undefined): boolean { return /^\d+$/.test(value ?? '') && Number(value) > 0; }
function validUnavailableDates(value: string): boolean { return value.trim() === '' || value.split(',').every((item) => isDateOnly(item.trim())); }
function validTimezone(value: string): boolean { try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; } }
function hasPartialPerformance(draft: OnboardingDraft): boolean { const item = draft.currentPerformance; return Boolean(item && (item.distanceMeters || item.timeSeconds || item.date || item.origin !== 'unknown' || item.confirmedByUser)); }
function validPerformance(draft: OnboardingDraft): boolean { const item = draft.currentPerformance; return Boolean(item && positiveInteger(item.distanceMeters) && positiveInteger(item.timeSeconds) && isDateOnly(item.date) && item.origin !== 'unknown' && item.origin !== 'strava_api' && item.confirmedByUser); }
function unavailable(message: string, fields: string[]): EligibilityResult { return { code: 'availability_incompatible', title: 'This schedule is not supported yet', message, fields, demoOnly }; }
function supportedTemplate(draft: OnboardingDraft): PlanTemplate | undefined {
  if (draft.goalKind !== 'distance_completion' || draft.goalEvent === 'marathon') return undefined;
  const goal = draft.goalEvent === '5k' ? '5k_completion' : draft.goalEvent === '10k' ? '10k_completion' : 'half_marathon_completion';
  return flexibleDemoTemplates.find((item) => item.supportedGoal === goal);
}
function fitsAllAuthoredSessions(template: PlanTemplate, pattern: number[], draft: OnboardingDraft): boolean {
  return template.phases.every((phase) => (phase.weeklySessions ?? [phase.sessions]).every((sessions) => sessions.every((session, index) => positiveInteger(draft.minuteLimits[pattern[index]]) && Number(draft.minuteLimits[pattern[index]]) * 60 >= session.durationSeconds)));
}
