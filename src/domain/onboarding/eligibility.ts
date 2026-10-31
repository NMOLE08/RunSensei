import { isDateOnly } from '@/domain/calendar/dateOnly';
import type { EligibilityResult, OnboardingDraft } from './types';
import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';

const demoOnly = true;
const missing = (fields: string[]): EligibilityResult => ({ code: 'insufficient_information', title: 'A few details are still needed', message: 'Complete the requested baseline and goal details before we can assess the demo pathway.', fields, demoOnly });

/** Eligibility only. It never creates a plan or infers readiness from a single 5K. */
export function assessEligibility(draft: OnboardingDraft, today?: string): EligibilityResult {
  if (draft.concernFlag) return { code: 'health_hold', title: 'Pause and reassess', message: 'A concern was noted. This app cannot assess or clear it; workout recommendations stay unavailable until the reviewed reassessment path exists.', fields: ['screening'], demoOnly };
  if (draft.recentInterruption === 'sustained') return { code: 'needs_reassessment', title: 'A fresh check-in is needed', message: 'A sustained interruption needs reassessment before a future schedule can be recommended.', fields: ['interruption'], demoOnly };
  const required = ['weeklyRunningMinutes', 'baselineLookbackDays', 'longestSessionMinutes', 'longestSessionDate', 'comfortableDurationMinutes', 'startDate', 'timezone'];
  const missingFields = required.filter((field) => !String(draft[field as keyof OnboardingDraft] ?? '').trim());
  if (draft.goalMode === 'fixed_date' && !draft.raceDate) missingFields.push('raceDate');
  if (![draft.weeklyRunningMinutes, draft.baselineLookbackDays, draft.longestSessionMinutes, draft.comfortableDurationMinutes].every(positiveInteger)) missingFields.push('baselineNumbers');
  const template = flexibleDemoTemplates.find((item) => item.supportedGoal === (draft.goalDistance === '5000' ? '5k_completion' : draft.goalDistance === '10000' ? '10k_completion' : 'half_marathon_completion'))!;
  const patterns = template.allowedWeeklyPatterns.filter((candidate) => draft.trainingDays.length === 3 && candidate.every((day) => draft.trainingDays.includes(day)) && candidate[2] === draft.preferredLongRunDay);
  if (patterns.length === 0) missingFields.push('trainingPattern');
  if (draft.preferredLongRunDay === null || !draft.trainingDays.includes(draft.preferredLongRunDay)) missingFields.push('preferredLongRunDay');
  if (patterns.length && !patterns.some((pattern) => template.phases.every((phase) => (phase.weeklySessions ?? [phase.sessions]).every((sessions) => sessions.every((session, index) => positiveInteger(draft.minuteLimits[pattern[index]]) && Number(draft.minuteLimits[pattern[index]]) * 60 >= session.durationSeconds))))) missingFields.push('minuteLimits');
  if (draft.recentInterruption === 'unknown') missingFields.push('interruption');
  if (missingFields.length > 0) return missing([...new Set(missingFields)]);
  if (!isDateOnly(draft.startDate) || (draft.goalMode === 'fixed_date' && !isDateOnly(draft.raceDate)) || !validUnavailableDates(draft.unavailableDates)) return missing(['dates']);
  if (today && draft.startDate < today) return { code: 'goal_date_incompatible', title: 'Choose a current start date', message: 'The plan start date is in the past. Choose today or a future date so the demo schedule appears on the right days.', fields: ['startDate'], demoOnly };
  if (draft.goalMode === 'fixed_date' && draft.raceDate <= draft.startDate) return { code: 'goal_date_incompatible', title: 'The race date needs changing', message: 'A fixed race date must be after the chosen start date. No schedule has been compressed or created.', fields: ['raceDate', 'startDate'], demoOnly };
  return { code: 'eligible', title: 'Your demo schedule is ready', message: 'The app used your goal and the baseline facts you entered to select a compatible synthetic demo structure. It did not require you to match a hidden preset. Reviewed training content is still required before this can be presented as coaching advice.', fields: [], demoOnly };
}

function positiveInteger(value: string | undefined): boolean { return /^\d+$/.test(value ?? '') && Number(value) > 0; }
function validUnavailableDates(value: string): boolean { return value.trim() === '' || value.split(',').every((item) => isDateOnly(item.trim())); }
