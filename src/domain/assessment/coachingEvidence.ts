import type { FitnessAssessmentDraft } from './types';

/**
 * A runner-reported V2 evidence view. These adapters deliberately do not
 * prescribe pace, workload, or eligibility: future versioned policy engines
 * must opt in to consuming this evidence.
 */
export type EvidenceProvenance = Readonly<{
  source: 'runner_reported_onboarding_v2';
  draftSchemaVersion: FitnessAssessmentDraft['schemaVersion'];
  recordedAt: string | null;
}>;

export type IntensityEvidence = Readonly<{
  provenance: EvidenceProvenance;
  runningStyle: FitnessAssessmentDraft['runningStyle'];
  easyRunTalkTest: FitnessAssessmentDraft['easyRunTalkTest'];
  usualComfortableRunEffort: FitnessAssessmentDraft['usualComfortableRunEffort'];
  performance: Readonly<{
    distanceMeters: string;
    seconds: string;
    date: string;
    quality: FitnessAssessmentDraft['performanceQuality'];
  }>;
}>;

export type WorkloadEvidence = Readonly<{
  provenance: EvidenceProvenance;
  observedWeeklyRunFrequency: FitnessAssessmentDraft['observedWeeklyRunFrequency'];
  runningConsistency: FitnessAssessmentDraft['runningConsistency'];
  preferredTrainingFrequency: FitnessAssessmentDraft['preferredTrainingFrequency'];
  weeklyMinutes: string;
  weeklyDistance: string;
  longestSession: Readonly<{ minutes: string; distance: string; distanceUnit: FitnessAssessmentDraft['longestSessionDistanceUnit']; date: string }>;
  comfortableRunMinutes: string;
  trainingDays: readonly number[];
  interruption: FitnessAssessmentDraft['interruption'];
  healthConcern: boolean;
}>;

const provenanceFor = (draft: FitnessAssessmentDraft): EvidenceProvenance => ({
  source: 'runner_reported_onboarding_v2',
  draftSchemaVersion: draft.schemaVersion,
  recordedAt: draft.updatedAt || null,
});

export function intensityEvidenceFromDraft(draft: FitnessAssessmentDraft): IntensityEvidence {
  return {
    provenance: provenanceFor(draft),
    runningStyle: draft.runningStyle,
    easyRunTalkTest: draft.easyRunTalkTest,
    usualComfortableRunEffort: draft.usualComfortableRunEffort,
    performance: { distanceMeters: draft.performanceDistanceMeters, seconds: draft.performanceSeconds, date: draft.performanceDate, quality: draft.performanceQuality },
  };
}

export function workloadEvidenceFromDraft(draft: FitnessAssessmentDraft): WorkloadEvidence {
  return {
    provenance: provenanceFor(draft),
    observedWeeklyRunFrequency: draft.observedWeeklyRunFrequency,
    runningConsistency: draft.runningConsistency,
    preferredTrainingFrequency: draft.preferredTrainingFrequency,
    weeklyMinutes: draft.weeklyMinutes,
    weeklyDistance: draft.weeklyDistance,
    longestSession: { minutes: draft.longestSessionMinutes, distance: draft.longestSessionDistance, distanceUnit: draft.longestSessionDistanceUnit, date: draft.longestSessionDate },
    comfortableRunMinutes: draft.comfortableRunMinutes,
    trainingDays: [...draft.trainingDays],
    interruption: draft.interruption,
    healthConcern: draft.healthConcern,
  };
}
