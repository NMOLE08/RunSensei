import { loadCurrentAccountPlanFacts } from './planAvailability';
import type { HalfMarathonResearchSimulation } from '@/domain/planning/halfMarathonDraft';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { generateCurrentFoundationProgram as generateFoundationProgram } from '@/domain/planning/foundationProgram';
import { nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { assessHalfMarathonReturnReadiness, type HalfMarathonReturnReadiness } from '@/domain/planning/halfMarathonReturnReadiness';
import { localDateOnly } from '@/features/execution/viewModel';
import { previewIdentityFor, type PlanPreviewIdentity } from './planPreviewIdentity';
import { buildMultiDistancePlanningInput } from './multiDistancePlanningInput';
import { simulateCurrentHalfMarathonDraft } from '@/domain/planning/halfMarathonDraft';

export type CurrentExperimentalHalfMarathonPreview = HalfMarathonResearchSimulation | ReturnType<typeof generateFoundationProgram> | { kind: 'unavailable'; reasonCodes: readonly string[]; missingEvidence?: readonly string[]; assessmentReasons?: readonly string[]; readiness?: HalfMarathonReturnReadiness; researchOnly: true; productionEligible: false };
export type CurrentExperimentalHalfMarathonPreviewResponse = Readonly<{
  value: CurrentExperimentalHalfMarathonPreview;
  previewContext: PlanPreviewIdentity;
  source: 'half_marathon' | 'foundation' | 'not_applicable';
}>;

/** Account-scoped read-only draft preview. It never creates a Plan or assignment. */
export async function openCurrentExperimentalHalfMarathonPreview(evaluationDate?: string): Promise<CurrentExperimentalHalfMarathonPreview> {
  return (await openCurrentExperimentalHalfMarathonPreviewWithProvenance(evaluationDate)).value;
}

/**
 * Returns the candidate together with the exact account-local facts used to
 * generate it. Consumers must compare this provenance with their requested
 * Plan context before rendering research content.
 */
export async function openCurrentExperimentalHalfMarathonPreviewWithProvenance(evaluationDate?: string): Promise<CurrentExperimentalHalfMarathonPreviewResponse> {
  const facts = await loadCurrentAccountPlanFacts();
  const previewContext = previewIdentityFor(facts.ownerId, facts.draft, new Date().toISOString(), evaluationDate ?? null, facts.pathwayIntent);
  const unavailable = (reasonCodes: readonly string[], source: CurrentExperimentalHalfMarathonPreviewResponse['source'], extra: Omit<Extract<CurrentExperimentalHalfMarathonPreview, { kind: 'unavailable' }>, 'kind' | 'reasonCodes' | 'researchOnly' | 'productionEligible'> = {}) => ({ value: { kind: 'unavailable' as const, reasonCodes, researchOnly: true as const, productionEligible: false as const, ...extra }, previewContext, source });
  if (!facts.draft) return unavailable(['onboarding_or_assessment_missing'], 'not_applicable');
  // A confirmation says the evidence is current; it is not a runner's choice
  // to leave half-marathon event preparation for a foundation programme. For
  // 21K, only the durable pathway intent selects Foundation. Older 5K/10K/42K
  // foundation research still keeps its confirmation-based compatibility path.
  const foundationRequested = facts.pathwayIntent?.choice === 'foundation'
    || (facts.draft.goal !== 'half_marathon' && !facts.pathwayIntent && isDateOnly(facts.draft.foundationEvidenceConfirmedAt ?? ''));
  const source = foundationRequested ? 'foundation' as const : facts.draft.goal === 'half_marathon' ? 'half_marathon' as const : 'not_applicable' as const;
  if (facts.draft.goal !== 'half_marathon' && !foundationRequested) return unavailable(['goal_not_half_marathon'], source);
  if (!facts.assessment) return unavailable(['onboarding_or_assessment_missing'], source);
  const current = assessFitness(facts.draft);
  if (facts.assessment.inputFingerprint !== current.inputFingerprint) return unavailable(['assessment_outdated'], source, { missingEvidence: current.missing, assessmentReasons: current.reasons });
  if (foundationRequested) {
    const d = facts.draft;
    if (d.goal === 'habit') return unavailable(['goal_policy_family_not_authored'], 'not_applicable');
    if (d.currentTrainingStatus === 'unknown') return unavailable(['current_training_context_unknown'], 'foundation');
    if (!isDateOnly(d.planStartDate)) return unavailable(['invalid_plan_start_date'], 'foundation');
    if (d.goalDateFixed && !isDateOnly(d.goalDate)) return unavailable(['invalid_goal_date'], 'foundation');
    if (d.interruption === 'unknown') return unavailable(['recent_interruption_required'], 'foundation');
    if (d.currentTrainingStatus === 'currently_training' && d.interruption !== 'none' && d.interruption !== 'health_related') return unavailable(['conflicting_current_training_context'], 'foundation');
    const foundationEvidenceConfirmed = isDateOnly(d.foundationEvidenceConfirmedAt ?? '');
    return { value: generateFoundationProgram({ context: d.currentTrainingStatus, currentWeeklyRunningSeconds: numberOrNull(d.weeklyMinutes) === null ? null : Number(d.weeklyMinutes) * 60, currentContinuousRunningSeconds: numberOrNull(d.comfortableRunMinutes) === null ? null : Number(d.comfortableRunMinutes) * 60, currentEvidenceConfirmed: foundationEvidenceConfirmed, comfortableWalkingConfirmed: foundationEvidenceConfirmed, demonstratedAfterBreak: d.foundationPostBreakConfirmed === true, requestedFrequency: d.foundationFrequency ?? null, healthConcern: d.healthConcern, healthRelatedInterruption: d.interruption === 'health_related' || d.interruptionReason === 'illness_or_injury' }, { ownerId: facts.ownerId, goalFamily: d.goal, startDate: nextMondayOnOrAfter(d.planStartDate), fixedGoalDate: d.goalDateFixed ? d.goalDate as `${number}-${number}-${number}` : null, availableDays: d.trainingDays.map(weekday => ({ weekday, maxMinutes: numberOrNull(d.minuteLimits[weekday] ?? ''), confirmedByRunner: d.minuteLimitConfirmedDays.includes(weekday) })), unavailableDates: d.unavailableDates.split(',').map(value => value.trim()).filter(isDateOnly), preferredLongRunDay: d.preferredLongDay }), previewContext, source: 'foundation' };
  }
  // The only authored event schedule is a completion-focused, pace-free
  // research programme. Do not silently present it as a performance or
  // time-target plan merely because the runner selected a half marathon.
  if (facts.draft.trainingObjective !== 'finish') return unavailable(['half_marathon_objective_not_authored'], 'half_marathon');
  if (current.code === 'insufficient_information') return unavailable(['assessment_insufficient_information'], 'half_marathon', { missingEvidence: current.missing, assessmentReasons: current.reasons });
  const readiness = assessHalfMarathonReturnReadiness({
    currentTrainingStatus: facts.draft.currentTrainingStatus,
    lastRunningDate: isDateOnly(facts.draft.lastRunningDate) ? facts.draft.lastRunningDate : null,
    interruptionReason: facts.draft.interruptionReason,
    interruption: facts.draft.interruption,
    healthConcern: facts.draft.healthConcern,
    currentCapabilityConfirmedAt: isDateOnly(facts.draft.currentCapabilityConfirmedAt) ? facts.draft.currentCapabilityConfirmedAt : null,
    historical: { weeklyMinutes: numberOrNull(facts.draft.weeklyMinutes), longestSessionMinutes: numberOrNull(facts.draft.longestSessionMinutes), comfortableRunMinutes: numberOrNull(facts.draft.comfortableRunMinutes), weeklyObservationDate: isDateOnly(facts.draft.weeklyEvidenceConfirmedAt) ? facts.draft.weeklyEvidenceConfirmedAt : null, longestSessionDate: isDateOnly(facts.draft.longestSessionDate) ? facts.draft.longestSessionDate : null },
  });
  if (readiness.state !== 'ready_for_supported_preparation') return unavailable(readiness.reasonCodes, 'half_marathon', { readiness });
  const planning = buildMultiDistancePlanningInput(facts.draft, facts.assessment);
  if (planning.kind === 'blocked') return unavailable(planning.reasonCodes, 'half_marathon', { missingEvidence: facts.assessment.missing, assessmentReasons: facts.assessment.reasons });
  if (planning.goalFamily !== 'half_marathon') return unavailable(['goal_not_half_marathon'], 'not_applicable');
  return { value: simulateCurrentHalfMarathonDraft({ ownerId: facts.ownerId, weeklyMinutes: planning.evidence.weeklyMinutes, longestSessionMinutes: planning.evidence.longestSessionMinutes, comfortableRunMinutes: planning.evidence.comfortableRunMinutes, weeklyEvidenceObservedAt: isDateOnly(facts.draft.weeklyEvidenceConfirmedAt) ? facts.draft.weeklyEvidenceConfirmedAt : null, longestSessionDate: isDateOnly(facts.draft.longestSessionDate) ? facts.draft.longestSessionDate : null, interruption: facts.draft.interruption, healthConcern: facts.draft.healthConcern, availableDays: planning.constraints.availableDays, unavailableDates: planning.constraints.unavailableDates, preferredLongRunDay: planning.constraints.preferredLongRunDay, startDate: planning.constraints.startDate, fixedGoalDate: planning.constraints.fixedGoalDate, asOfDate: (evaluationDate ?? localDateOnly()) as `${number}-${number}-${number}`, returnReadiness: readiness }), previewContext, source: 'half_marathon' };
}

function numberOrNull(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
