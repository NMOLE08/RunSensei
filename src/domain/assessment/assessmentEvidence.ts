import { fingerprint } from '@/domain/context';
import type { FitnessAssessmentDraft } from './types';

/**
 * The stable, runner-meaningful input to a fitness assessment.
 *
 * A local record timestamp, database owner, identifier, or schema migration
 * must never make a runner's assessment stale.  The values below are limited
 * to evidence, safety answers, goal intent, and constraints which can affect
 * the assessment or an experimental planning decision.
 */
export type AssessmentEvidenceProjection = Readonly<{
  weeklyDistance: number | null;
  weeklyDistanceUnit: FitnessAssessmentDraft['weeklyDistanceUnit'];
  weeklyMinutes: number | null;
  weeklyEvidenceConfirmedAt: string | null;
  currentCapabilityConfirmedAt: string | null;
  foundationEvidenceConfirmedAt: string | null;
  foundationFrequency: number | null;
  foundationPostBreakConfirmed: boolean;
  currentTrainingStatus: FitnessAssessmentDraft['currentTrainingStatus'];
  lastRunningDate: string | null;
  interruptionReason: FitnessAssessmentDraft['interruptionReason'];
  longestSessionMinutes: number | null;
  longestSessionDate: string | null;
  comfortableRunMinutes: number | null;
  interruption: FitnessAssessmentDraft['interruption'];
  healthConcern: boolean;
  performanceQuality: FitnessAssessmentDraft['performanceQuality'];
  goal: FitnessAssessmentDraft['goal'];
  goalFocus: FitnessAssessmentDraft['goalFocus'];
  targetTimeSeconds: number | null;
  goalDate: string | null;
  goalDateFixed: boolean;
  planStartDate: string | null;
  trainingDays: readonly number[];
  minuteLimits: Readonly<Record<number, number | null>>;
  minuteLimitConfirmedDays: readonly number[];
  preferredLongDay: number | null;
  unavailableDates: readonly string[];
  adultAgeConfirmed: boolean | null;
  canWalk30MinutesComfortably: boolean | null;
  first5kExperience: FitnessAssessmentDraft['first5kExperience'];
}>;

const positiveNumber = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const dateOnlyOrNull = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const uniqueSorted = (values: readonly number[]) => [...new Set(values)].sort((left, right) => left - right);

export function assessmentEvidenceProjection(draft: FitnessAssessmentDraft): AssessmentEvidenceProjection {
  const trainingDays = uniqueSorted(draft.trainingDays);
  return {
    weeklyDistance: positiveNumber(draft.weeklyDistance),
    weeklyDistanceUnit: draft.weeklyDistanceUnit,
    weeklyMinutes: positiveNumber(draft.weeklyMinutes),
    weeklyEvidenceConfirmedAt: dateOnlyOrNull(draft.weeklyEvidenceConfirmedAt),
    currentCapabilityConfirmedAt: dateOnlyOrNull(draft.currentCapabilityConfirmedAt),
    foundationEvidenceConfirmedAt: dateOnlyOrNull(draft.foundationEvidenceConfirmedAt ?? ''),
    foundationFrequency: draft.foundationFrequency ?? null,
    foundationPostBreakConfirmed: draft.foundationPostBreakConfirmed === true,
    currentTrainingStatus: draft.currentTrainingStatus,
    lastRunningDate: dateOnlyOrNull(draft.lastRunningDate),
    interruptionReason: draft.interruptionReason,
    longestSessionMinutes: positiveNumber(draft.longestSessionMinutes),
    longestSessionDate: dateOnlyOrNull(draft.longestSessionDate),
    comfortableRunMinutes: positiveNumber(draft.comfortableRunMinutes),
    interruption: draft.interruption,
    healthConcern: draft.healthConcern,
    performanceQuality: draft.performanceQuality,
    goal: draft.goal,
    goalFocus: draft.goalFocus,
    targetTimeSeconds: positiveNumber(draft.targetTimeSeconds),
    goalDate: draft.goalDateFixed ? dateOnlyOrNull(draft.goalDate) : null,
    goalDateFixed: draft.goalDateFixed,
    planStartDate: dateOnlyOrNull(draft.planStartDate),
    trainingDays,
    minuteLimits: Object.fromEntries(trainingDays.map((day) => [day, positiveNumber(draft.minuteLimits[day] ?? '')])),
    minuteLimitConfirmedDays: uniqueSorted(draft.minuteLimitConfirmedDays.filter((day) => trainingDays.includes(day))),
    preferredLongDay: draft.preferredLongDay,
    unavailableDates: draft.unavailableDates.split(',').map((value) => value.trim()).filter((value) => dateOnlyOrNull(value) !== null).sort(),
    adultAgeConfirmed: draft.adultAgeConfirmed,
    canWalk30MinutesComfortably: draft.canWalk30MinutesComfortably,
    first5kExperience: draft.first5kExperience,
  };
}

/** Version-two assessment identity. It intentionally excludes record metadata. */
export function assessmentEvidenceFingerprint(draft: FitnessAssessmentDraft): string {
  return fingerprint(assessmentEvidenceProjection(draft));
}
