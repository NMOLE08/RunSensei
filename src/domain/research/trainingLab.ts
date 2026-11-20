import type { AdaptationPreviewAssignment } from '@/domain/adaptation/previewBeginner5kAdaptation';
import { beginner5kContinuousCandidatePersonalizationPolicy } from '@/domain/planning/beginner5kPersonalizationPolicy';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { currentCompletionVersions } from '@/domain/performance/summarizeWorkoutHistory';
import type { PlannedWorkoutSnapshot, WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';
import type { Comparison, WorkoutPerformanceAnalysis } from '@/domain/performance/analyzeWorkoutPerformance';
import type { Beginner5kResearchFixture, Beginner5kResearchSimulation, ResearchScenario } from './runBeginner5kResearchSimulation';
import { runBeginner5kResearchSimulation } from './runBeginner5kResearchSimulation';

export type TrainingLabFixtureId = 'run_walk_flexible' | 'continuous_flexible' | 'run_walk_fixed_goal' | 'continuous_fixed_goal';

export const trainingLabScenarios: readonly { id: ResearchScenario; label: string }[] = [
  { id: 'completed_week', label: 'Completed comfortably' },
  { id: 'partial', label: 'Partially completed' },
  { id: 'missed', label: 'Missed workout' },
  { id: 'unreported', label: 'Unreported workout' },
  { id: 'one_difficult', label: 'One difficult workout' },
  { id: 'repeated_difficult', label: 'Repeated difficult workouts' },
  { id: 'fatigue', label: 'Unusual fatigue' },
  { id: 'pain', label: 'Pain concern' },
  { id: 'corrected', label: 'Corrected completion record' },
  { id: 'policy_mismatch', label: 'Policy-reference mismatch' },
  { id: 'scheduling_conflict', label: 'Scheduling conflict' },
  { id: 'event_preservation', label: 'Final event preservation' },
] as const;

export const trainingLabFixtures: readonly { id: TrainingLabFixtureId; label: string; description: string }[] = [
  { id: 'run_walk_flexible', label: 'First-time runner', description: 'Draft run/walk pathway; flexible completion goal.' },
  { id: 'continuous_flexible', label: 'Continuous runner', description: 'Draft continuous-running pathway; flexible completion goal.' },
  { id: 'run_walk_fixed_goal', label: 'First-time runner / fixed date', description: 'Shows that a repeated stage cannot silently move a fixed event.' },
  { id: 'continuous_fixed_goal', label: 'Continuous runner / fixed date', description: 'Shows fixed-date conflict behavior for the second pathway.' },
] as const;

export type TrainingLabRunResult = { kind: 'disabled'; reason: string } | { kind: 'result'; value: Beginner5kResearchSimulation };

/** Builds only synthetic evidence. It must never receive a signed-in account or persisted activity. */
export function createTrainingLabFixture(id: TrainingLabFixtureId, scenario: ResearchScenario): Beginner5kResearchFixture {
  const continuous = id.startsWith('continuous');
  const fixed = id.endsWith('fixed_goal');
  return {
    id: `training-lab:${id}:${scenario}`,
    simulationDate: '2026-11-02',
    pathwayPolicyReference: { policyId: beginner5kContinuousCandidatePersonalizationPolicy.policyId, version: beginner5kContinuousCandidatePersonalizationPolicy.version },
    pathwayId: continuous ? 'continuous_running_beginner_fixed_12_week' : 'true_beginner_fixed_12_week_run_walk',
    pathwayVersion: '0.1.0-draft',
    strictInput: {
      adultAgeConfirmed: true, canWalk30MinutesComfortably: true, experience: continuous ? 'substantial' : 'none_or_limited', healthConcern: false, interruption: 'none', goal: 'first_5k_completion', goalFocus: 'completion', planStartDate: '2026-11-02', availableDays: [1, 3, 6], continuousRunMinutes: continuous ? 20 : null, weeklyRunningMinutes: continuous ? 50 : null, weeklyDistance: null, longestRecentSessionMinutes: continuous ? 20 : null, weekdayMinuteLimits: { 1: 120, 3: 120, 6: 120 },
    },
    candidateEvidence: {
      adultAgeConfirmed: true, canWalk30MinutesComfortably: true, healthConcern: false, interruption: 'none', planStartDate: '2026-11-02', availableDays: [1, 3, 6], weekdayMinuteLimits: { 1: 120, 3: 120, 6: 120 }, continuousRunMinutes: continuous ? 20 : null, weeklyRunningMinutes: continuous ? 50 : null, longestRecentSessionMinutes: continuous ? 20 : null, historyAgeDays: continuous ? 7 : null, longestSessionAgeDays: continuous ? 7 : null,
    },
    goalMode: fixed ? 'fixed_date' : 'flexible', goalDate: fixed ? '2027-01-24' : null, currentWeek: 3, scenario,
  };
}

/** Guard must be evaluated before this function is called by the route. It is dependency-injectable for isolation tests. */
export function runTrainingLabFixture(enabled: boolean, fixtureId: TrainingLabFixtureId, scenario: ResearchScenario, runner: (fixture: Beginner5kResearchFixture) => Beginner5kResearchSimulation = runBeginner5kResearchSimulation): TrainingLabRunResult {
  if (!enabled) return { kind: 'disabled', reason: 'Training Lab is disabled outside an explicitly enabled development session.' };
  return { kind: 'result', value: runner(createTrainingLabFixture(fixtureId, scenario)) };
}

export function sessionsForLabWeek(result: Beginner5kResearchSimulation, week: number): readonly First5kDraftSession[] {
  return result.calendar.sessions.filter((session) => session.week === week);
}

export function displayDuration(seconds: number | null): string {
  if (seconds === null) return 'Unknown duration';
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} min` : `${minutes}:${String(remainder).padStart(2, '0')} min`;
}

export function describeSessionSteps(session: First5kDraftSession): readonly string[] {
  return session.steps.map((step) => {
    if (step.kind === 'event') return '5,000 m self-paced walk/run event — duration remains unknown; walking breaks allowed.';
    const duration = step.seconds === null ? 'unknown duration' : displayDuration(step.seconds);
    const repeats = step.repeats > 1 ? ` × ${step.repeats}` : '';
    return `${step.kind}: ${duration}${repeats}; draft effort guidance ${step.rpe ?? 'unknown'}`;
  });
}

export function assignmentChangeKind(assignment: AdaptationPreviewAssignment, before: readonly AdaptationPreviewAssignment[]): 'repeated' | 'shifted' | 'unchanged' {
  if (assignment.copiedFromSource) return 'repeated';
  const original = before.find((item) => item.sourceWorkoutId === assignment.sourceWorkoutId);
  return original && original.session.date === assignment.session.date ? 'unchanged' : 'shifted';
}

export type TrainingLabPerformanceRow = { label: string; planned: PlannedWorkoutSnapshot; currentOutcome: WorkoutCompletionRecord | null; currentAnalysis: WorkoutPerformanceAnalysis | null; supersededOutcomes: readonly WorkoutCompletionRecord[] };

/** Read-only presentation rows. Missing outcomes stay null; no synthetic ActivityLog is constructed. */
export function performanceRowsForLab(result: Beginner5kResearchSimulation): readonly TrainingLabPerformanceRow[] {
  const current = currentCompletionVersions(result.completions);
  return result.plannedSnapshots.map((planned) => {
    const currentOutcome = current.find((item) => item.workoutId === planned.logicalSessionId) ?? null;
    const currentAnalysis = currentOutcome?.activityLogId ? result.analyses.find((item) => item.workoutId === planned.logicalSessionId && item.evidenceIds.includes(currentOutcome.activityLogId!)) ?? null : null;
    const superseded = result.completions.filter((item) => item.workoutId === planned.logicalSessionId && item.activityLogId !== currentOutcome?.activityLogId);
    return { label: readableWorkoutLabel(planned.logicalSessionId), planned, currentOutcome, currentAnalysis, supersededOutcomes: superseded };
  });
}

export function readableWorkoutLabel(logicalSessionId: string): string {
  const match = logicalSessionId.match(/:w(\d+)([ABC])$/i);
  return match ? `Week ${match[1]} · Workout ${match[2].toUpperCase()}` : 'Scheduled workout';
}

export type TrainingLabStepPresentation = { label: string; detail: string };

/** Presentation-only transformation of immutable authored steps. It does not change their timing or order. */
export function presentWorkoutSteps(session: First5kDraftSession): readonly TrainingLabStepPresentation[] {
  return session.steps.map((step) => {
    if (step.kind === 'event') return { label: '5K completion event', detail: '5,000 m self-paced walk/run. Walking breaks allowed; duration is unknown.' };
    const label = step.kind === 'warmup' ? 'Warm-up' : step.kind === 'cooldown' ? 'Cooldown' : step.kind === 'walk' ? 'Walking recovery' : 'Run';
    const quantity = step.repeats > 1 ? `${displayDuration(step.seconds)} × ${step.repeats}` : displayDuration(step.seconds);
    return { label, detail: `${quantity} · effort ${step.rpe ?? 'not specified'}` };
  });
}

export function displayDurationWithRaw(seconds: number | null): string {
  if (seconds === null) return 'Unknown duration';
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  return `${minutes} min ${remainder} sec (${seconds} s)`;
}

export function explainComparison(comparison: Comparison, metric: 'duration' | 'running_time' | 'distance'): string {
  if (comparison.kind === 'comparable') {
    if (comparison.difference === 0) return `${metricLabel(metric)} matches the planned value.`;
    const direction = comparison.difference > 0 ? 'longer' : 'shorter';
    return `${metricLabel(metric)} was ${displayDuration(Math.abs(comparison.difference))} ${direction} than planned.`;
  }
  if (comparison.kind === 'unknown') return metric === 'distance' ? 'No reliable recorded distance is available for this comparison.' : `No recorded ${metricLabel(metric).toLowerCase()} is available for this comparison.`;
  return metric === 'distance' ? 'Distance cannot be compared because this timed workout has no matching planned distance target.' : `${metricLabel(metric)} cannot be compared from the available evidence.`;
}

export function explainReasonCode(code: string): string {
  const descriptions: Record<string, string> = {
    isolated_difficult_feedback_no_decline_inference: 'One difficult workout alone does not establish a declining trend.',
    repeated_difficult_pattern_draft_rule: 'Repeated difficult feedback triggered a draft review candidate.',
    lower_workload_variant_not_authored: 'No authored lower-workload alternative exists for this draft programme.',
    interruption_or_unusual_fatigue_requires_review: 'Unusual fatigue or interruption requires review before changing training.',
    health_concern_reported: 'A reported health concern blocks automatic plan changes.',
    fixed_goal_date_repeat_conflict: 'Repeating a stage would move a fixed goal date, so no schedule was generated.',
    partial_workout_reported: 'A partial workout was reported; no make-up workload was added.',
    missed_workout_reported: 'A missed workout was reported; no make-up workload was added.',
    scheduled_outcome_unreported: 'At least one scheduled workout has no recorded outcome.',
  };
  return descriptions[code] ?? 'This draft result is blocked until the referenced evidence or policy requirement is reviewed.';
}

export type TrainingLabPreviewSummary = { beforeCount: number; afterCount: number; repeated: number; shifted: number; unchanged: number; finalEventCount: number; warnings: readonly string[] };

export function summarizeAdaptationPreview(preview: Extract<Beginner5kResearchSimulation['preview'], { kind: 'preview' }>): TrainingLabPreviewSummary {
  const counts = preview.after.reduce((summary, assignment) => {
    const kind = assignmentChangeKind(assignment, preview.before); summary[kind] += 1;
    if (assignment.session.distanceMeters === 5000) summary.finalEventCount += 1;
    return summary;
  }, { repeated: 0, shifted: 0, unchanged: 0, finalEventCount: 0 });
  return { beforeCount: preview.before.length, afterCount: preview.after.length, ...counts, warnings: preview.validation.coachingReviewWarnings };
}

function metricLabel(metric: 'duration' | 'running_time' | 'distance') { return metric === 'running_time' ? 'Running time' : metric === 'distance' ? 'Distance' : 'Duration'; }
