import { analyzeWorkoutPerformance, compareSameWindowObservations } from '@/domain/performance/analyzeWorkoutPerformance';
import { currentCompletionVersions, summarizeRecentTrend, summarizeWeek } from '@/domain/performance/summarizeWorkoutHistory';
import { completionFromActivity, plannedComponents, type PlannedWorkoutSnapshot, type WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';

const runWalk: PlannedWorkoutSnapshot = { assignmentId: 'assignment-1', logicalSessionId: 'workout-1', planId: 'plan-1', revisionId: 'rev-1', plannedDate: '2026-11-03', policyReferences: ['pack@0.1'], pathwayReference: { id: 'run-walk', version: '0.1' }, structure: 'run_walk', durationSeconds: 1770, distanceMeters: null, steps: [{ kind: 'warmup', seconds: 300, repeats: 1 }, { kind: 'run', seconds: 60, repeats: 8 }, { kind: 'walk', seconds: 90, repeats: 7 }, { kind: 'run', seconds: 60, repeats: 1 }, { kind: 'cooldown', seconds: 300, repeats: 1 }] };
const continuous: PlannedWorkoutSnapshot = { assignmentId: 'assignment-2', logicalSessionId: 'workout-2', planId: 'plan-1', revisionId: 'rev-1', plannedDate: '2026-11-05', policyReferences: ['continuous@0.1'], pathwayReference: { id: 'continuous', version: '0.1' }, structure: 'continuous_run', durationSeconds: 1500, distanceMeters: null, steps: [{ kind: 'warmup', seconds: 300, repeats: 1 }, { kind: 'run', seconds: 900, repeats: 1 }, { kind: 'cooldown', seconds: 300, repeats: 1 }] };
const record = (changes: Partial<WorkoutCompletionRecord> = {}): WorkoutCompletionRecord => ({ activityLogId: 'log-1', previousVersionId: null, workoutId: 'workout-1', planId: 'plan-1', revisionId: 'rev-1', policyReferences: ['pack@0.1'], pathwayReference: { id: 'run-walk', version: '0.1' }, status: 'completed', actualDate: '2026-11-03', completedAt: '2026-11-03T10:00:00Z', actualDurationSeconds: 1600, actualRunningSeconds: null, actualDistanceMeters: null, rpe: 4, difficulty: 'comfortable', fatigue: 'none', discomfort: 'none', reason: null, note: null, source: 'timer_only', durationReliability: 'high', distanceReliability: 'unknown', observedWindow: { start: '2026-11-03T09:30:00Z', end: '2026-11-03T10:00:00Z' }, ...changes });

describe('System D workout performance analysis', () => {
  it('derives run/walk running time from authored steps without treating main time as running time', () => {
    const components = plannedComponents(runWalk);
    expect(components).toMatchObject({ totalSeconds: 1770, runningSeconds: 540, walkingSeconds: 630, warmupSeconds: 300, cooldownSeconds: 300 });
    const analysis = analyzeWorkoutPerformance(record(), runWalk);
    expect(analysis.duration).toMatchObject({ kind: 'comparable', planned: 1770, actual: 1600, difference: -170 });
    expect(analysis.runningTime).toEqual({ kind: 'unknown', reason: 'actual_or_planned_running_duration_unknown' });
  });

  it('analyses continuous running separately and preserves unknown step-level actuals', () => {
    const analysis = analyzeWorkoutPerformance(record({ workoutId: 'workout-2', policyReferences: ['continuous@0.1'], pathwayReference: { id: 'continuous', version: '0.1' }, actualRunningSeconds: 850 }), continuous);
    expect(analysis.plannedComponents?.runningSeconds).toBe(900);
    expect(analysis.runningTime).toMatchObject({ kind: 'comparable', planned: 900, actual: 850, difference: -50 });
    expect(analysis.distance).toEqual({ kind: 'not_comparable', reason: 'planned_distance_unknown' });
  });

  it('does not compare distance without a reliable planned and actual distance', () => {
    const event = { ...continuous, durationSeconds: null, distanceMeters: 5000, steps: [{ kind: 'event' as const, seconds: null, repeats: 1 }] };
    expect(analyzeWorkoutPerformance(record({ actualDistanceMeters: 5000, distanceReliability: 'medium' }), event).distance).toEqual({ kind: 'not_comparable', reason: 'distance_not_reliably_comparable' });
    expect(analyzeWorkoutPerformance(record({ actualDistanceMeters: 5000, distanceReliability: 'high' }), event).distance).toMatchObject({ kind: 'comparable', difference: 0 });
  });

  it('distinguishes unreported, missed, partial, and different activity without inventing facts', () => {
    const records = [record(), record({ activityLogId: 'log-2', workoutId: 'workout-2', status: 'partial', actualDurationSeconds: 600 }), record({ activityLogId: 'log-3', workoutId: 'workout-3', status: 'missed', actualDurationSeconds: null }), record({ activityLogId: 'log-4', workoutId: 'workout-4', status: 'different_activity' })];
    const analyses = records.map((item) => analyzeWorkoutPerformance(item, item.workoutId === 'workout-1' ? runWalk : null));
    const summary = summarizeWeek('2026-11-02', ['workout-1', 'workout-2', 'workout-3', 'workout-4', 'workout-5'], records, analyses);
    expect(summary).toMatchObject({ scheduledWorkouts: 5, reportedOutcomes: 4, completed: 1, partial: 1, missed: 1, differentActivity: 1, unreported: 1 });
  });

  it('uses current outcome versions in summaries and retains correction history without double counting', () => {
    const old = record({ activityLogId: 'old', actualDurationSeconds: 1000 });
    const correction = record({ activityLogId: 'new', previousVersionId: 'old', actualDurationSeconds: 1600, difficulty: 'too_difficult' });
    expect(currentCompletionVersions([old, correction]).map((item) => item.activityLogId)).toEqual(['new']);
    const analysis = analyzeWorkoutPerformance(correction, runWalk);
    const summary = summarizeWeek('2026-11-02', ['workout-1'], [old, correction], [analysis]);
    expect(summary).toMatchObject({ completed: 1, currentOutcomeRecordIds: ['new'] });
    expect(summarizeRecentTrend([old, correction], [analysis]).difficultyCounts.too_difficult).toBe(1);
  });

  it('returns data-quality, policy-reference, and health signals rather than coaching advice', () => {
    const analysis = analyzeWorkoutPerformance(record({ actualDurationSeconds: 300, actualRunningSeconds: 400, policyReferences: ['wrong@1'], discomfort: 'pain_or_injury_concern' }), runWalk);
    expect(analysis.dataQualityIssues).toEqual(expect.arrayContaining(['running_duration_exceeds_total_duration', 'historical_policy_reference_mismatch']));
    expect(analysis.healthHoldSignal).toBe(true);
  });

  it('does not compare observations from different or unknown measurement windows', () => {
    expect(compareSameWindowObservations({ value: 20, window: { start: '2026-10-01', end: '2026-10-08' } }, { value: 30, window: { start: '2026-10-08', end: '2026-11-01' } })).toEqual({ kind: 'not_comparable', reason: 'incompatible_time_windows' });
    expect(compareSameWindowObservations({ value: 20, window: { start: null, end: null } }, { value: 30, window: { start: null, end: null } })).toEqual({ kind: 'not_comparable', reason: 'observation_window_unknown' });
  });

  it('reuses the existing structured activity feedback without inventing step-level facts', () => {
    const mapped = completionFromActivity({ id: 'activity', previousVersionId: null, sessionId: 'workout-1', actualDate: '2026-11-03', durationSeconds: 1000, distanceMeters: null, intendedEffort: null, reportedEffort: JSON.stringify({ version: 1, exertion: 7, comparison: 'harder' }), source: 'manual', reasonsJson: '[]', concernFlagsJson: '[]', createdAt: '2026-11-03T10:00:00Z' }, 'partial', runWalk);
    expect(mapped).toMatchObject({ status: 'partial', rpe: 7, difficulty: 'too_difficult', actualRunningSeconds: null });
  });
});
