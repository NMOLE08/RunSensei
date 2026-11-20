import { plannedComponents, type PlannedWorkoutSnapshot, type WorkoutCompletionRecord } from './workoutCompletion';

export type Comparison = { kind: 'comparable'; planned: number; actual: number; difference: number } | { kind: 'unknown'; reason: string } | { kind: 'not_comparable'; reason: string };
export type WorkoutPerformanceAnalysis = {
  workoutId: string;
  status: WorkoutCompletionRecord['status'];
  policyReferences: readonly string[];
  pathwayReference: WorkoutCompletionRecord['pathwayReference'];
  plannedComponents: ReturnType<typeof plannedComponents> | null;
  duration: Comparison;
  runningTime: Comparison;
  distance: Comparison;
  dataQualityIssues: readonly string[];
  evidenceIds: readonly string[];
  healthHoldSignal: boolean;
  reportedFatigue: WorkoutCompletionRecord['fatigue'];
};

/** Pure factual comparison. It deliberately has no recommendation or plan mutation. */
export function analyzeWorkoutPerformance(record: WorkoutCompletionRecord, planned: PlannedWorkoutSnapshot | null): WorkoutPerformanceAnalysis {
  const issues = validateRecord(record, planned);
  const components = planned ? plannedComponents(planned) : null;
  const duration = compare(record.actualDurationSeconds, planned?.durationSeconds ?? null, 'actual_or_planned_duration_unknown');
  const runningTime = planned && components && components.runningSeconds !== null
    ? compare(record.actualRunningSeconds, components.runningSeconds, 'actual_or_planned_running_duration_unknown')
    : { kind: 'not_comparable' as const, reason: planned ? 'planned_running_component_unknown' : 'planned_snapshot_unavailable' };
  const distance = record.distanceReliability === 'high' && planned && planned.distanceMeters !== null
    ? compare(record.actualDistanceMeters, planned.distanceMeters, 'actual_or_planned_distance_unknown')
    : { kind: 'not_comparable' as const, reason: planned?.distanceMeters === null ? 'planned_distance_unknown' : record.actualDistanceMeters === null ? 'actual_distance_unknown' : 'distance_not_reliably_comparable' };
  if (record.status === 'unreported') issues.push('unreported_outcome');
  if (record.status === 'missed' && (record.actualDurationSeconds !== null || record.actualDistanceMeters !== null || record.actualRunningSeconds !== null)) issues.push('missed_outcome_contains_activity');
  if (planned && record.policyReferences.length && !sameReferences(record.policyReferences, planned.policyReferences)) issues.push('historical_policy_reference_mismatch');
  return { workoutId: record.workoutId, status: record.status, policyReferences: record.policyReferences, pathwayReference: record.pathwayReference, plannedComponents: components, duration, runningTime, distance, dataQualityIssues: [...new Set(issues)].sort(), evidenceIds: [record.activityLogId, planned?.assignmentId].filter((value): value is string => Boolean(value)), healthHoldSignal: record.discomfort === 'pain_or_injury_concern', reportedFatigue: record.fatigue };
}

export type TimedObservation = { value: number | null; window: { start: string | null; end: string | null } };
/** Only compares values whose full measurement windows are exactly the same. */
export function compareSameWindowObservations(left: TimedObservation, right: TimedObservation): Comparison {
  if (left.value === null || right.value === null) return { kind: 'unknown', reason: 'observation_value_unknown' };
  if (!left.window.start || !left.window.end || !right.window.start || !right.window.end) return { kind: 'not_comparable', reason: 'observation_window_unknown' };
  if (left.window.start !== right.window.start || left.window.end !== right.window.end) return { kind: 'not_comparable', reason: 'incompatible_time_windows' };
  return { kind: 'comparable', planned: left.value, actual: right.value, difference: right.value - left.value };
}

function compare(actual: number | null, planned: number | null, unknownReason: string): Comparison {
  if (actual === null || planned === null) return { kind: 'unknown', reason: unknownReason };
  return { kind: 'comparable', planned, actual, difference: actual - planned };
}
function validateRecord(record: WorkoutCompletionRecord, planned: PlannedWorkoutSnapshot | null): string[] {
  const issues: string[] = [];
  for (const [name, value] of Object.entries({ actualDurationSeconds: record.actualDurationSeconds, actualRunningSeconds: record.actualRunningSeconds, actualDistanceMeters: record.actualDistanceMeters })) if (value !== null && (!Number.isFinite(value) || value < 0)) issues.push(`invalid_${name}`);
  if (record.actualDurationSeconds !== null && record.actualRunningSeconds !== null && record.actualRunningSeconds > record.actualDurationSeconds) issues.push('running_duration_exceeds_total_duration');
  if (record.rpe !== null && (!Number.isInteger(record.rpe) || record.rpe < 1 || record.rpe > 10)) issues.push('invalid_rpe');
  if (!planned) issues.push('planned_snapshot_unavailable');
  return issues;
}
function sameReferences(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((item, index) => item === right[index]); }
