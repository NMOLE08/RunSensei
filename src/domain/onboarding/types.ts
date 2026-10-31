import type { DateOnly } from '@/domain/calendar/dateOnly';
import type { UnitSystem } from '@/domain/training/entities';

export type GoalMode = 'fixed_date' | 'flexible';
export type Interruption = 'none' | 'sustained' | 'unknown';
export type EntryRequirementStatus = 'unknown' | 'meets' | 'not_yet';
export type EligibilityCode = 'eligible' | 'insufficient_information' | 'needs_base_build' | 'goal_date_incompatible' | 'needs_reassessment' | 'health_hold';

export interface OnboardingDraft {
  id: 'current';
  weeklyRunningMinutes: string;
  baselineLookbackDays: string;
  longestSessionMinutes: string;
  longestSessionDate: string;
  comfortableDurationMinutes: string;
  recentInterruption: Interruption;
  entryRequirementStatus: EntryRequirementStatus;
  concernFlag: boolean;
  goalMode: GoalMode;
  goalDistance: '5000' | '10000' | '21097';
  raceDate: string;
  startDate: string;
  trainingDays: number[];
  minuteLimits: Record<number, string>;
  preferredLongRunDay: number | null;
  unavailableDates: string;
  units: UnitSystem;
  timezone: string;
  updatedAt: string;
}

export interface EligibilityResult { code: EligibilityCode; title: string; message: string; fields: string[]; demoOnly: boolean; }
export const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const emptyDraft = (timezone: string): OnboardingDraft => ({ id: 'current', weeklyRunningMinutes: '', baselineLookbackDays: '', longestSessionMinutes: '', longestSessionDate: '', comfortableDurationMinutes: '', recentInterruption: 'unknown', entryRequirementStatus: 'unknown', concernFlag: false, goalMode: 'fixed_date', goalDistance: '21097', raceDate: '', startDate: '', trainingDays: [], minuteLimits: {}, preferredLongRunDay: null, unavailableDates: '', units: 'metric', timezone, updatedAt: '' });
export type DraftDate = DateOnly;
