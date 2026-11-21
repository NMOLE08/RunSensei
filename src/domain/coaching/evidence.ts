import type { DateOnly } from '@/domain/calendar/dateOnly';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';

export type EvidenceIssue = Readonly<{ code: string; fields: readonly (keyof FitnessAssessmentDraft)[] }>;
export type EvidenceFact<T> = Readonly<{
  state: 'available'; value: T; source: 'runner_reported'; fields: readonly (keyof FitnessAssessmentDraft)[];
  observedOn: DateOnly | null; confirmedOn: DateOnly | null; reliability: 'runner_reported_unverified'; normalizationVersion: 1;
}> | Readonly<{ state: 'missing' | 'unknown' | 'invalid' | 'conflicting' | 'unverifiable_freshness'; fields: readonly (keyof FitnessAssessmentDraft)[]; reasonCodes: readonly string[]; normalizationVersion: 1 }>;
export type DistanceEvidence = Readonly<{ originalValue: number; unit: 'km' | 'mi'; meters: number }>;
export type FrequencyEvidence = Readonly<{ kind: 'exact'; days: 0 | 1 | 2 | 3 | 4 } | { kind: 'five_or_more' | 'variable' }>;
export type ObjectiveEvidence = Readonly<{ value: FitnessAssessmentDraft['trainingObjective']; origin: 'uncertain_explicit_or_default' | 'legacy_derived' | 'unknown' }>;
export type NormalizedCoachingEvidence = Readonly<{
  version: 1; identity: string; ownerId: string; evaluationDate: DateOnly;
  weeklyMinutes: EvidenceFact<number>; weeklyDistance: EvidenceFact<DistanceEvidence>; historyDays: EvidenceFact<number>;
  longestMinutes: EvidenceFact<number>; longestDistance: EvidenceFact<DistanceEvidence>;
  comfortableMinutes: EvidenceFact<number>; observedFrequency: EvidenceFact<FrequencyEvidence>;
  objective: ObjectiveEvidence;
  performance: Readonly<{ distanceMeters: EvidenceFact<number>; seconds: EvidenceFact<number>; date: DateOnly | null; kind: FitnessAssessmentDraft['performanceKind']; effort: FitnessAssessmentDraft['performanceEffort']; quality: FitnessAssessmentDraft['performanceQuality']; suitability: 'unassessed' | 'non_maximal' | 'incomplete' }>;
  context: Readonly<{ runningStyle: FitnessAssessmentDraft['runningStyle']; talkTest: FitnessAssessmentDraft['easyRunTalkTest']; usualEffort: FitnessAssessmentDraft['usualComfortableRunEffort']; consistency: FitnessAssessmentDraft['runningConsistency']; status: FitnessAssessmentDraft['currentTrainingStatus']; lastRunningDate: DateOnly | null; interruption: FitnessAssessmentDraft['interruption']; interruptionReason: FitnessAssessmentDraft['interruptionReason']; healthConcern: boolean; preferredFrequency: FitnessAssessmentDraft['preferredTrainingFrequency']; availableDays: readonly number[]; preferredLongDay: number | null; unavailableDates: readonly DateOnly[]; weeklyConfirmedOn: DateOnly | null; capacityConfirmedOn: DateOnly | null; foundationConfirmedOn: DateOnly | null }>;
  issues: readonly EvidenceIssue[];
}>;
