export type AssessmentGoal = 'habit' | '5k' | '10k' | 'half_marathon' | 'marathon';
export type InterruptionStatus = 'none' | 'under_1_week' | 'one_to_four_weeks' | 'over_four_weeks' | 'health_related' | 'unknown';
export type EvidenceQuality = 'reliable' | 'approximate' | 'unknown';
export type First5kExperience = 'none_or_limited' | 'substantial' | 'unknown';
export type CurrentTrainingStatus = 'currently_training' | 'returning_after_break' | 'first_time_runner' | 'unknown';
export type InterruptionReason = 'schedule_or_travel' | 'inconsistent_training' | 'illness_or_injury' | 'other' | 'prefer_not_to_say' | 'unknown';
export type CoachId = 'moss' | 'jett';
export type FitnessAssessmentDraft = {
  id: 'system-a'; schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7; ownerId: string; updatedAt: string;
  weeklyDistance: string; weeklyDistanceUnit: 'km' | 'mi'; weeklyMinutes: string; historyDays: string;
  /** Local calendar date on which the runner explicitly confirmed the weekly aggregate is current. */
  weeklyEvidenceConfirmedAt: string;
  /** Local calendar date on which the runner explicitly confirmed all supplied capacity facts are current. */
  currentCapabilityConfirmedAt: string;
  /** Confirms weekly/continuous running and comfortable walking, excluding historical longest session. */
  foundationEvidenceConfirmedAt?: string;
  /** Explicit research-preview choice. It is never inferred from available weekdays. */
  foundationFrequency?: 2 | 3 | null;
  foundationPostBreakConfirmed?: boolean;
  currentTrainingStatus: CurrentTrainingStatus;
  lastRunningDate: string;
  interruptionReason: InterruptionReason;
  longestSessionMinutes: string; longestSessionDate: string; comfortableRunMinutes: string;
  interruption: InterruptionStatus; interruptionNote: string; healthConcern: boolean;
  performanceDistanceMeters: string; performanceSeconds: string; performanceDate: string;
  performanceKind: 'race' | 'time_trial' | 'normal_run' | 'unknown'; performanceEffort: 'easy' | 'moderate' | 'hard' | 'all_out' | 'unknown'; performanceQuality: EvidenceQuality;
  goal: AssessmentGoal; goalFocus: 'finish' | 'target_time' | 'consistency'; targetTimeSeconds: string; goalDate: string; goalDateFixed: boolean; planStartDate: string;
  trainingDays: number[]; minuteLimits: Record<number, string>; minuteLimitConfirmedDays: number[]; preferredLongDay: number | null; unavailableDates: string;
  units: 'metric' | 'imperial'; timezone: string;
  /** First-5K eligibility declarations. They are not medical clearance. */
  adultAgeConfirmed: boolean | null;
  canWalk30MinutesComfortably: boolean | null;
  first5kExperience: First5kExperience;
  /** Presentation preference only; never an assessment or prescription input. */
  coachId: CoachId | null;
  /** True only after the selected coach intro completed or was explicitly skipped. */
  coachIntroAcknowledged: boolean;
};
export type AssessmentCode = 'eligible_for_policy_selection' | 'insufficient_information' | 'needs_base_build' | 'needs_reassessment' | 'health_hold' | 'goal_date_incompatible' | 'unsupported_goal';
export type RunnerClassification = 'beginner' | 'intermediate' | 'advanced' | 'insufficient_information';
export type FitnessAssessmentResult = { version: 'system-a-v1' | 'system-a-v2'; code: AssessmentCode; classification: RunnerClassification; confidence: EvidenceQuality; reasons: string[]; missing: string[]; alternatives: string[]; inputFingerprint: string; createdAt: string };

export const emptyFitnessAssessmentDraft = (ownerId: string, timezone: string): FitnessAssessmentDraft => ({
  id: 'system-a', schemaVersion: 7, ownerId, updatedAt: '', weeklyDistance: '', weeklyDistanceUnit: 'km', weeklyMinutes: '', historyDays: '28', weeklyEvidenceConfirmedAt: '', currentCapabilityConfirmedAt: '', foundationEvidenceConfirmedAt: '', foundationFrequency: null, foundationPostBreakConfirmed: false, currentTrainingStatus: 'unknown', lastRunningDate: '', interruptionReason: 'unknown', longestSessionMinutes: '', longestSessionDate: '', comfortableRunMinutes: '', interruption: 'unknown', interruptionNote: '', healthConcern: false,
  performanceDistanceMeters: '', performanceSeconds: '', performanceDate: '', performanceKind: 'unknown', performanceEffort: 'unknown', performanceQuality: 'unknown', goal: '5k', goalFocus: 'finish', targetTimeSeconds: '', goalDate: '', goalDateFixed: false, planStartDate: '',
  trainingDays: [], minuteLimits: {}, minuteLimitConfirmedDays: [], preferredLongDay: null, unavailableDates: '', units: 'metric', timezone,
  adultAgeConfirmed: null, canWalk30MinutesComfortably: null, first5kExperience: 'unknown', coachId: null, coachIntroAcknowledged: false,
});

/** Adds new JSON-backed fields when a saved version-1 draft is reopened. */
export function normalizeFitnessAssessmentDraft(value: FitnessAssessmentDraft): FitnessAssessmentDraft {
  // Older account drafts predate this explicit choice. Preserve that absence as
  // null so the preview can ask the runner, rather than silently deriving a
  // frequency from their available weekdays.
  const rawFoundationFrequency: unknown = value.foundationFrequency;
  const foundationFrequency = rawFoundationFrequency === 2 || rawFoundationFrequency === '2'
    ? 2
    : rawFoundationFrequency === 3 || rawFoundationFrequency === '3'
      ? 3
      : null;
  return {
    ...value,
    schemaVersion: 7,
    weeklyEvidenceConfirmedAt: value.weeklyEvidenceConfirmedAt ?? '',
    currentCapabilityConfirmedAt: value.currentCapabilityConfirmedAt ?? '',
    foundationEvidenceConfirmedAt: value.foundationEvidenceConfirmedAt ?? '',
    foundationFrequency,
    foundationPostBreakConfirmed: value.foundationPostBreakConfirmed === true,
    currentTrainingStatus: value.currentTrainingStatus ?? 'unknown',
    lastRunningDate: value.lastRunningDate ?? '',
    interruptionReason: value.interruptionReason ?? 'unknown',
    planStartDate: value.planStartDate ?? '',
    adultAgeConfirmed: value.adultAgeConfirmed ?? null,
    canWalk30MinutesComfortably: value.canWalk30MinutesComfortably ?? null,
    first5kExperience: value.first5kExperience ?? 'unknown',
    minuteLimitConfirmedDays: value.minuteLimitConfirmedDays ?? [],
    coachId: value.coachId === 'moss' || value.coachId === 'jett' ? value.coachId : null,
    coachIntroAcknowledged: value.coachIntroAcknowledged === true && (value.coachId === 'moss' || value.coachId === 'jett'),
  };
}
