import { assessFitness } from '@/domain/assessment/assessFitness';
import type { HalfMarathonResearchSimulation } from '@/domain/planning/halfMarathonDraft';
import { simulateCurrentHalfMarathonDraft } from '@/domain/planning/halfMarathonDraft';
import { assessHalfMarathonReturnReadiness, type HalfMarathonReturnReadiness } from '@/domain/planning/halfMarathonReturnReadiness';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { localDateOnly } from '@/features/execution/viewModel';
import { buildMultiDistancePlanningInput } from './multiDistancePlanningInput';
import type { CurrentAccountPlanFacts } from './planFacts';

export type HalfMarathonEventCandidateResult =
  | Readonly<{ kind: 'candidate'; simulation: Extract<HalfMarathonResearchSimulation, { kind: 'simulation' }> }>
  | Readonly<{
    kind: 'blocked';
    reasonCodes: readonly string[];
    missingEvidence?: readonly string[];
    assessmentReasons?: readonly string[];
    readiness?: HalfMarathonReturnReadiness;
  }>;

/**
 * The event-preparation half-marathon simulation, extracted from the Plan
 * preview adapter so prepared-candidate persistence can reuse the exact same
 * freshness, readiness, scheduling, and validation rules.
 */
export function generateCurrentHalfMarathonEventCandidate(facts: CurrentAccountPlanFacts, evaluationDate?: string): HalfMarathonEventCandidateResult {
  const draft = facts.draft;
  if (!draft || draft.goal !== 'half_marathon') return { kind: 'blocked', reasonCodes: ['goal_not_half_marathon'] };
  if (!facts.assessment) return { kind: 'blocked', reasonCodes: ['onboarding_or_assessment_missing'] };
  const current = assessFitness(draft);
  if (facts.assessment.inputFingerprint !== current.inputFingerprint) return { kind: 'blocked', reasonCodes: ['assessment_outdated'], missingEvidence: current.missing, assessmentReasons: current.reasons };
  // The only authored event schedule is a completion-focused, pace-free
  // research programme. Do not silently present it as a performance or
  // time-target plan merely because the runner selected a half marathon.
  if (draft.trainingObjective !== 'finish') return { kind: 'blocked', reasonCodes: ['half_marathon_objective_not_authored'] };
  if (current.code === 'insufficient_information') return { kind: 'blocked', reasonCodes: ['assessment_insufficient_information'], missingEvidence: current.missing, assessmentReasons: current.reasons };
  const readiness = assessHalfMarathonReturnReadiness({
    currentTrainingStatus: draft.currentTrainingStatus,
    lastRunningDate: isDateOnly(draft.lastRunningDate) ? draft.lastRunningDate : null,
    interruptionReason: draft.interruptionReason,
    interruption: draft.interruption,
    healthConcern: draft.healthConcern,
    currentCapabilityConfirmedAt: isDateOnly(draft.currentCapabilityConfirmedAt) ? draft.currentCapabilityConfirmedAt : null,
    historical: {
      weeklyMinutes: numberOrNull(draft.weeklyMinutes),
      longestSessionMinutes: numberOrNull(draft.longestSessionMinutes),
      comfortableRunMinutes: numberOrNull(draft.comfortableRunMinutes),
      weeklyObservationDate: isDateOnly(draft.weeklyEvidenceConfirmedAt) ? draft.weeklyEvidenceConfirmedAt : null,
      longestSessionDate: isDateOnly(draft.longestSessionDate) ? draft.longestSessionDate : null,
    },
  });
  if (readiness.state !== 'ready_for_supported_preparation') return { kind: 'blocked', reasonCodes: readiness.reasonCodes, readiness };
  const planning = buildMultiDistancePlanningInput(draft, facts.assessment);
  if (planning.kind === 'blocked') return { kind: 'blocked', reasonCodes: planning.reasonCodes, missingEvidence: facts.assessment.missing, assessmentReasons: facts.assessment.reasons };
  if (planning.goalFamily !== 'half_marathon') return { kind: 'blocked', reasonCodes: ['goal_not_half_marathon'] };
  const simulation = simulateCurrentHalfMarathonDraft({
    ownerId: facts.ownerId,
    weeklyMinutes: planning.evidence.weeklyMinutes,
    longestSessionMinutes: planning.evidence.longestSessionMinutes,
    comfortableRunMinutes: planning.evidence.comfortableRunMinutes,
    weeklyEvidenceObservedAt: isDateOnly(draft.weeklyEvidenceConfirmedAt) ? draft.weeklyEvidenceConfirmedAt : null,
    longestSessionDate: isDateOnly(draft.longestSessionDate) ? draft.longestSessionDate : null,
    interruption: draft.interruption,
    healthConcern: draft.healthConcern,
    availableDays: planning.constraints.availableDays,
    unavailableDates: planning.constraints.unavailableDates,
    preferredLongRunDay: planning.constraints.preferredLongRunDay,
    startDate: planning.constraints.startDate,
    fixedGoalDate: planning.constraints.fixedGoalDate,
    asOfDate: (evaluationDate ?? localDateOnly()) as `${number}-${number}-${number}`,
    returnReadiness: readiness,
  });
  if (simulation.kind !== 'simulation') return { kind: 'blocked', reasonCodes: simulation.reasonCodes };
  return { kind: 'candidate', simulation };
}

function numberOrNull(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
