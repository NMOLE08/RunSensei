import type { WorkoutPerformanceAnalysis } from './analyzeWorkoutPerformance';
import type { WorkoutCompletionRecord } from './workoutCompletion';

export type WeeklyPerformanceSummary = { weekStart: string; scheduledWorkouts: number; reportedOutcomes: number; completed: number; partial: number; missed: number; differentActivity: number; unreported: number; healthHoldSignal: boolean; dataQualityIssues: readonly string[]; currentOutcomeRecordIds: readonly string[] };

/** Removes superseded records for summary counts but leaves historical corrections intact. */
export function currentCompletionVersions(records: readonly WorkoutCompletionRecord[]): readonly WorkoutCompletionRecord[] {
  const superseded = new Set(records.map((record) => record.previousVersionId).filter((value): value is string => value !== null));
  return records.filter((record) => record.activityLogId === null || !superseded.has(record.activityLogId));
}

/** The denominator is scheduled workouts supplied by the caller; unreported is never reclassified as missed. */
export function summarizeWeek(weekStart: string, scheduledWorkoutIds: readonly string[], records: readonly WorkoutCompletionRecord[], analyses: readonly WorkoutPerformanceAnalysis[]): WeeklyPerformanceSummary {
  const current = currentCompletionVersions(records);
  const byWorkout = new Map<string, WorkoutCompletionRecord>();
  for (const record of current) if (scheduledWorkoutIds.includes(record.workoutId)) byWorkout.set(record.workoutId, record);
  const outcomes = scheduledWorkoutIds.map((workoutId) => byWorkout.get(workoutId) ?? unreported(workoutId));
  const relevantAnalyses = analyses.filter((analysis) => scheduledWorkoutIds.includes(analysis.workoutId));
  return {
    weekStart, scheduledWorkouts: scheduledWorkoutIds.length, reportedOutcomes: outcomes.filter((record) => record.status !== 'unreported').length,
    completed: outcomes.filter((record) => record.status === 'completed').length, partial: outcomes.filter((record) => record.status === 'partial').length,
    missed: outcomes.filter((record) => record.status === 'missed').length, differentActivity: outcomes.filter((record) => record.status === 'different_activity').length,
    unreported: outcomes.filter((record) => record.status === 'unreported').length, healthHoldSignal: relevantAnalyses.some((analysis) => analysis.healthHoldSignal),
    dataQualityIssues: [...new Set(relevantAnalyses.flatMap((analysis) => analysis.dataQualityIssues))].sort(), currentOutcomeRecordIds: outcomes.map((record) => record.activityLogId).filter((id): id is string => id !== null),
  };
}

export type RecentWorkoutTrend = { consideredWorkoutIds: readonly string[]; statusCounts: Readonly<Record<WorkoutCompletionRecord['status'], number>>; difficultyCounts: Readonly<Record<'comfortable' | 'too_easy' | 'challenging' | 'too_difficult' | 'unknown', number>>; healthHoldSignal: boolean; unknownEvidenceCount: number };
export function summarizeRecentTrend(records: readonly WorkoutCompletionRecord[], analyses: readonly WorkoutPerformanceAnalysis[]): RecentWorkoutTrend {
  const current = currentCompletionVersions(records);
  const statuses: Record<WorkoutCompletionRecord['status'], number> = { unreported: 0, completed: 0, partial: 0, missed: 0, different_activity: 0 };
  const difficulties: Record<'comfortable' | 'too_easy' | 'challenging' | 'too_difficult' | 'unknown', number> = { comfortable: 0, too_easy: 0, challenging: 0, too_difficult: 0, unknown: 0 };
  for (const record of current) { statuses[record.status] += 1; difficulties[record.difficulty ?? 'unknown'] += 1; }
  const currentIds = new Set(current.map((record) => record.activityLogId).filter(Boolean));
  const relevant = analyses.filter((analysis) => currentIds.has(analysis.evidenceIds[0]));
  return { consideredWorkoutIds: current.map((record) => record.workoutId), statusCounts: statuses, difficultyCounts: difficulties, healthHoldSignal: relevant.some((analysis) => analysis.healthHoldSignal), unknownEvidenceCount: relevant.filter((analysis) => analysis.duration.kind === 'unknown' || analysis.runningTime.kind === 'unknown' || analysis.distance.kind === 'unknown').length };
}
function unreported(workoutId: string): WorkoutCompletionRecord { return { activityLogId: null, previousVersionId: null, workoutId, planId: null, revisionId: null, policyReferences: [], pathwayReference: null, status: 'unreported', actualDate: null, completedAt: null, actualDurationSeconds: null, actualRunningSeconds: null, actualDistanceMeters: null, rpe: null, difficulty: null, fatigue: null, discomfort: null, reason: null, note: null, source: 'unknown', durationReliability: 'unknown', distanceReliability: 'unknown', observedWindow: { start: null, end: null } }; }
