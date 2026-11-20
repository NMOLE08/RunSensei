import { buildMultiDistancePlanningInput } from './multiDistancePlanningInput';
import { loadCurrentAccountPlanFacts } from './planAvailability';
import { simulateHalfMarathonDraft, type HalfMarathonResearchSimulation } from '@/domain/planning/halfMarathonDraft';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { generateCurrentFoundationProgram as generateFoundationProgram } from '@/domain/planning/foundationProgram';
import { nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import { localDateOnly } from '@/features/execution/viewModel';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { assessHalfMarathonReturnReadiness, type HalfMarathonReturnReadiness } from '@/domain/planning/halfMarathonReturnReadiness';

export type CurrentExperimentalHalfMarathonPreview = HalfMarathonResearchSimulation | ReturnType<typeof generateFoundationProgram> | { kind: 'unavailable'; reasonCodes: readonly string[]; missingEvidence?: readonly string[]; assessmentReasons?: readonly string[]; readiness?: HalfMarathonReturnReadiness; researchOnly: true; productionEligible: false };

/** Account-scoped read-only draft preview. It never creates a Plan or assignment. */
export async function openCurrentExperimentalHalfMarathonPreview(): Promise<CurrentExperimentalHalfMarathonPreview> {
  const facts = await loadCurrentAccountPlanFacts();
  if (!facts.draft) return { kind: 'unavailable', reasonCodes: ['onboarding_or_assessment_missing'], researchOnly: true, productionEligible: false };
  const foundationRequested = isDateOnly(facts.draft.foundationEvidenceConfirmedAt ?? '');
  if (facts.draft.goal !== 'half_marathon' && !foundationRequested) return { kind: 'unavailable', reasonCodes: ['goal_not_half_marathon'], researchOnly: true, productionEligible: false };
  if (!facts.assessment) return { kind: 'unavailable', reasonCodes: ['onboarding_or_assessment_missing'], researchOnly: true, productionEligible: false };
  const current = assessFitness(facts.draft);
  if (facts.assessment.inputFingerprint !== current.inputFingerprint) return { kind: 'unavailable', reasonCodes: ['assessment_outdated'], missingEvidence: current.missing, assessmentReasons: current.reasons, researchOnly: true, productionEligible: false };
  if (foundationRequested) {
    const d = facts.draft;
    const unavailable = (reason: string): CurrentExperimentalHalfMarathonPreview => ({ kind: 'unavailable', reasonCodes: [reason], researchOnly: true, productionEligible: false });
    if (d.goal === 'habit') return unavailable('goal_policy_family_not_authored');
    if (d.currentTrainingStatus === 'unknown') return unavailable('current_training_context_unknown');
    if (!isDateOnly(d.planStartDate)) return unavailable('invalid_plan_start_date');
    if (d.goalDateFixed && !isDateOnly(d.goalDate)) return unavailable('invalid_goal_date');
    if (d.interruption === 'unknown') return unavailable('recent_interruption_required');
    if (d.currentTrainingStatus === 'currently_training' && d.interruption !== 'none' && d.interruption !== 'health_related') return unavailable('conflicting_current_training_context');
    return generateFoundationProgram({ context: d.currentTrainingStatus, currentWeeklyRunningSeconds: numberOrNull(d.weeklyMinutes) === null ? null : Number(d.weeklyMinutes) * 60, currentContinuousRunningSeconds: numberOrNull(d.comfortableRunMinutes) === null ? null : Number(d.comfortableRunMinutes) * 60, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: d.foundationPostBreakConfirmed === true, requestedFrequency: d.foundationFrequency ?? null, healthConcern: d.healthConcern, healthRelatedInterruption: d.interruption === 'health_related' || d.interruptionReason === 'illness_or_injury' }, { ownerId: facts.ownerId, goalFamily: d.goal, startDate: nextMondayOnOrAfter(d.planStartDate), fixedGoalDate: d.goalDateFixed ? d.goalDate as `${number}-${number}-${number}` : null, availableDays: d.trainingDays.map(weekday => ({ weekday, maxMinutes: numberOrNull(d.minuteLimits[weekday] ?? ''), confirmedByRunner: d.minuteLimitConfirmedDays.includes(weekday) })), unavailableDates: d.unavailableDates.split(',').map(value => value.trim()).filter(isDateOnly), preferredLongRunDay: d.preferredLongDay });
  }
  if (current.code === 'insufficient_information') return { kind: 'unavailable', reasonCodes: ['assessment_insufficient_information'], missingEvidence: current.missing, assessmentReasons: current.reasons, researchOnly: true, productionEligible: false };
  const readiness = assessHalfMarathonReturnReadiness({
    currentTrainingStatus: facts.draft.currentTrainingStatus,
    lastRunningDate: isDateOnly(facts.draft.lastRunningDate) ? facts.draft.lastRunningDate : null,
    interruptionReason: facts.draft.interruptionReason,
    interruption: facts.draft.interruption,
    healthConcern: facts.draft.healthConcern,
    currentCapabilityConfirmedAt: isDateOnly(facts.draft.currentCapabilityConfirmedAt) ? facts.draft.currentCapabilityConfirmedAt : null,
    historical: { weeklyMinutes: numberOrNull(facts.draft.weeklyMinutes), longestSessionMinutes: numberOrNull(facts.draft.longestSessionMinutes), comfortableRunMinutes: numberOrNull(facts.draft.comfortableRunMinutes), weeklyObservationDate: isDateOnly(facts.draft.weeklyEvidenceConfirmedAt) ? facts.draft.weeklyEvidenceConfirmedAt : null, longestSessionDate: isDateOnly(facts.draft.longestSessionDate) ? facts.draft.longestSessionDate : null },
  });
  if (readiness.state !== 'ready_for_supported_preparation') return { kind: 'unavailable', reasonCodes: readiness.reasonCodes, readiness, researchOnly: true, productionEligible: false };
  const planning = buildMultiDistancePlanningInput(facts.draft, facts.assessment);
  if (planning.kind === 'blocked') return { kind: 'unavailable', reasonCodes: planning.reasonCodes, missingEvidence: facts.assessment.missing, assessmentReasons: facts.assessment.reasons, researchOnly: true, productionEligible: false };
  if (planning.goalFamily !== 'half_marathon') return { kind: 'unavailable', reasonCodes: ['goal_not_half_marathon'], researchOnly: true, productionEligible: false };
  return simulateHalfMarathonDraft({ ownerId: facts.ownerId, weeklyMinutes: planning.evidence.weeklyMinutes, longestSessionMinutes: planning.evidence.longestSessionMinutes, comfortableRunMinutes: planning.evidence.comfortableRunMinutes, weeklyEvidenceObservedAt: isDateOnly(facts.draft.weeklyEvidenceConfirmedAt) ? facts.draft.weeklyEvidenceConfirmedAt : null, longestSessionDate: isDateOnly(facts.draft.longestSessionDate) ? facts.draft.longestSessionDate : null, interruption: facts.draft.interruption, healthConcern: facts.draft.healthConcern, availableDays: planning.constraints.availableDays, unavailableDates: planning.constraints.unavailableDates, preferredLongRunDay: planning.constraints.preferredLongRunDay, startDate: planning.constraints.startDate, fixedGoalDate: planning.constraints.fixedGoalDate, asOfDate: localDateOnly() as `${number}-${number}-${number}`, returnReadiness: readiness });
}

function numberOrNull(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
