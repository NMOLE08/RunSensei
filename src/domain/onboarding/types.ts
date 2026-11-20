import type { DateOnly } from '@/domain/calendar/dateOnly';
import type { UnitSystem } from '@/domain/training/entities';

export type GoalMode = 'fixed_date' | 'flexible';
export type Interruption = 'none' | 'sustained' | 'unknown';
export type EntryRequirementStatus = 'unknown' | 'meets' | 'not_yet';
export type EligibilityCode = 'eligible' | 'insufficient_information' | 'needs_base_build' | 'goal_date_incompatible' | 'needs_reassessment' | 'health_hold' | 'unsupported_goal' | 'availability_incompatible' | 'no_reviewed_content';
export type DataOrigin = 'runsensei_native' | 'user_reported' | 'manual_verified' | 'strava_api' | 'unknown';
export type ObservationQuality = 'high' | 'medium' | 'low' | 'unknown';
export type GoalKind = 'start_running' | 'distance_completion' | 'improve_speed' | 'improve_endurance' | 'maintain_fitness';
export type GoalEvent = '5k' | '10k' | 'half_marathon' | 'marathon';
export type ExperienceCategory = 'unknown' | 'new' | 'returning' | 'recreational' | 'experienced';
export type VolumePreference = 'gradual' | 'steady' | 'progressive';
export type DifficultyPreference = 'comfortable' | 'balanced' | 'challenging';

export interface ValueWithProvenance<T> {
  value: T | null;
  origin: DataOrigin;
  observedAt: string | null;
  quality: ObservationQuality;
  confirmedByUser: boolean;
}

export interface BaselineWeekDraft {
  id: string;
  startDate: string;
  endDate: string;
  distance: ValueWithProvenance<string>;
  durationMinutes: ValueWithProvenance<string>;
  gapReason: string;
}

export interface PerformanceDraft {
  distanceMeters: string;
  timeSeconds: string;
  date: string;
  origin: DataOrigin;
  confirmedByUser: boolean;
}

export interface OnboardingDraft {
  id: 'current';
  schemaVersion: 3;
  goalKind: GoalKind;
  goalEvent: GoalEvent;
  targetPerformanceSeconds: string;
  targetHorizonWeeks: string;
  motivation: string;
  experienceCategory: ExperienceCategory;
  runningExperienceMonths: string;
  recentRunsPerWeek: string;
  baselineHistoryStatus: 'unknown' | 'reported' | 'native_confirmed';
  baselineWeeks: BaselineWeekDraft[];
  currentPerformance: PerformanceDraft | null;
  weeklyRunningMinutes: string;
  baselineLookbackDays: string;
  longestSessionMinutes: string;
  longestSessionDate: string;
  comfortableDurationMinutes: string;
  recentInterruption: Interruption;
  entryRequirementStatus: EntryRequirementStatus;
  concernFlag: boolean;
  goalMode: GoalMode;
  goalDistance: '5000' | '10000' | '21097' | '42195';
  raceDate: string;
  startDate: string;
  trainingDays: number[];
  minuteLimits: Record<number, string>;
  preferredLongRunDay: number | null;
  unavailableDates: string;
  restDays: number[];
  scheduleType: 'fixed' | 'variable';
  preferredRunTime: 'morning' | 'afternoon' | 'evening' | 'variable';
  trackAccess: boolean;
  gymAccess: boolean;
  treadmillAccess: boolean;
  volumePreference: VolumePreference;
  difficultyPreference: DifficultyPreference;
  workoutPreferences: string[];
  crossTrainingDays: number[];
  weeklyTimeCapMinutes: string;
  longestRunCapMinutes: string;
  coachingPersonality: 'encouraging' | 'direct' | 'calm';
  assumptionsConfirmed: boolean;
  units: UnitSystem;
  timezone: string;
  updatedAt: string;
}

export interface EligibilityResult { code: EligibilityCode; title: string; message: string; fields: string[]; demoOnly: boolean; }
export const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const emptyValue = (): ValueWithProvenance<string> => ({ value: null, origin: 'unknown', observedAt: null, quality: 'unknown', confirmedByUser: false });
export const emptyBaselineWeeks = (): BaselineWeekDraft[] => Array.from({ length: 4 }, (_, index) => ({ id: `week-${index + 1}`, startDate: '', endDate: '', distance: emptyValue(), durationMinutes: emptyValue(), gapReason: '' }));
export const emptyDraft = (timezone: string): OnboardingDraft => ({ id: 'current', schemaVersion: 3, goalKind: 'distance_completion', goalEvent: 'half_marathon', targetPerformanceSeconds: '', targetHorizonWeeks: '', motivation: '', experienceCategory: 'unknown', runningExperienceMonths: '', recentRunsPerWeek: '', baselineHistoryStatus: 'unknown', baselineWeeks: emptyBaselineWeeks(), currentPerformance: null, weeklyRunningMinutes: '', baselineLookbackDays: '', longestSessionMinutes: '', longestSessionDate: '', comfortableDurationMinutes: '', recentInterruption: 'unknown', entryRequirementStatus: 'unknown', concernFlag: false, goalMode: 'fixed_date', goalDistance: '21097', raceDate: '', startDate: '', trainingDays: [], minuteLimits: {}, preferredLongRunDay: null, unavailableDates: '', restDays: [], scheduleType: 'fixed', preferredRunTime: 'variable', trackAccess: false, gymAccess: false, treadmillAccess: false, volumePreference: 'steady', difficultyPreference: 'comfortable', workoutPreferences: ['easy'], crossTrainingDays: [], weeklyTimeCapMinutes: '', longestRunCapMinutes: '', coachingPersonality: 'encouraging', assumptionsConfirmed: false, units: 'metric', timezone, updatedAt: '' });
export type DraftDate = DateOnly;
