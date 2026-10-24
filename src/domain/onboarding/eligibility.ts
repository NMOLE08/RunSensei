import { isDateOnly } from '@/domain/calendar/dateOnly';
import type { EligibilityResult, OnboardingDraft } from './types';

const demoOnly = true;
const missing = (fields: string[]): EligibilityResult => ({ code: 'insufficient_information', title: 'A few details are still needed', message: 'Complete the highlighted baseline, goal, and availability details before we can assess the demo pathway.', fields, demoOnly });
const supportedPatterns = [[1, 3, 6], [0, 2, 5]];
const requiredMinutesByGoal: Record<OnboardingDraft['goalDistance'], [number, number, number]> = { '5000': [15, 15, 20], '10000': [20, 20, 30], '21097': [20, 25, 40] };

/** Eligibility only. It never creates a plan or infers readiness from a single 5K. */
export function assessEligibility(draft: OnboardingDraft): EligibilityResult {
  if (draft.concernFlag) return { code: 'health_hold', title: 'Pause and reassess', message: 'A concern was noted. This app cannot assess or clear it; workout recommendations stay unavailable until the reviewed reassessment path exists.', fields: ['screening'], demoOnly };
  if (draft.recentInterruption === 'sustained') return { code: 'needs_reassessment', title: 'A fresh check-in is needed', message: 'A sustained interruption needs reassessment before a future schedule can be recommended.', fields: ['interruption'], demoOnly };
  if (draft.entryRequirementStatus === 'not_yet') return { code: 'needs_base_build', title: 'Build a base first', message: 'The selected half-marathon pathway is not offered yet. This app does not invent a bridge plan.', fields: ['entryRequirements'], demoOnly };
  const required = ['weeklyRunningMinutes', 'longestSessionMinutes', 'longestSessionDate', 'comfortableDurationMinutes', 'startDate', 'timezone'];
  const missingFields = required.filter((field) => !String(draft[field as keyof OnboardingDraft] ?? '').trim());
  if (draft.goalMode === 'fixed_date' && !draft.raceDate) missingFields.push('raceDate');
  if (![draft.weeklyRunningMinutes, draft.longestSessionMinutes, draft.comfortableDurationMinutes].every(positiveInteger)) missingFields.push('baselineNumbers');
  const pattern = supportedPatterns.find((candidate) => candidate.every((day, index) => day === draft.trainingDays[index]));
  if (!pattern) missingFields.push('trainingPattern');
  if (draft.preferredLongRunDay === null || !draft.trainingDays.includes(draft.preferredLongRunDay)) missingFields.push('preferredLongRunDay');
  if (pattern && pattern.some((day, index) => !positiveInteger(draft.minuteLimits[day]) || Number(draft.minuteLimits[day]) < requiredMinutesByGoal[draft.goalDistance][index])) missingFields.push('minuteLimits');
  if (missingFields.length > 0) return missing([...new Set(missingFields)]);
  if (!isDateOnly(draft.startDate) || (draft.goalMode === 'fixed_date' && !isDateOnly(draft.raceDate)) || !validUnavailableDates(draft.unavailableDates)) return missing(['dates']);
  if (draft.goalMode === 'fixed_date' && draft.raceDate <= draft.startDate) return { code: 'goal_date_incompatible', title: 'The race date needs changing', message: 'A fixed race date must be after the chosen start date. No schedule has been compressed or created.', fields: ['raceDate', 'startDate'], demoOnly };
  if (draft.entryRequirementStatus !== 'meets') return missing(['entryRequirements']);
  return { code: 'eligible', title: 'Demo pathway can be previewed', message: 'Your inputs are complete for a development-only eligibility preview. Reviewed training content is still required before any real plan can activate.', fields: [], demoOnly };
}

function positiveInteger(value: string | undefined): boolean { return /^\d+$/.test(value ?? '') && Number(value) > 0; }
function validUnavailableDates(value: string): boolean { return value.trim() === '' || value.split(',').every((item) => isDateOnly(item.trim())); }
