import { analyzeWorkoutPerformance } from '@/domain/performance/analyzeWorkoutPerformance';
import { summarizeRecentTrend, summarizeWeek } from '@/domain/performance/summarizeWorkoutHistory';
import type { PlannedWorkoutSnapshot, WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';
import { createFutureProposalRequest, evaluateBeginner5kAdaptation, type Beginner5kAdaptationInput } from '@/domain/adaptation/evaluateBeginner5kAdaptation';
import { beginner5kAdaptationV01, validateBeginner5kAdaptationPolicy } from '@/domain/adaptation/beginner5kAdaptationPolicy';

const planned: PlannedWorkoutSnapshot = { assignmentId: 'assignment-1', logicalSessionId: 'session-1', planId: 'plan-1', revisionId: 'rev-1', plannedDate: '2026-11-03', policyReferences: ['pack@1'], pathwayReference: { id: 'run-walk', version: '0.1' }, structure: 'run_walk', durationSeconds: 1200, distanceMeters: null, steps: [{ kind: 'warmup', seconds: 300, repeats: 1 }, { kind: 'run', seconds: 300, repeats: 1 }, { kind: 'walk', seconds: 300, repeats: 1 }, { kind: 'cooldown', seconds: 300, repeats: 1 }] };
const record = (change: Partial<WorkoutCompletionRecord> = {}): WorkoutCompletionRecord => ({ activityLogId: 'log-1', previousVersionId: null, workoutId: 'session-1', planId: 'plan-1', revisionId: 'rev-1', policyReferences: ['pack@1'], pathwayReference: { id: 'run-walk', version: '0.1' }, status: 'completed', actualDate: '2026-11-03', completedAt: '2026-11-03T10:00:00Z', actualDurationSeconds: 1200, actualRunningSeconds: null, actualDistanceMeters: null, rpe: null, difficulty: 'comfortable', fatigue: 'none', discomfort: 'none', reason: null, note: null, source: 'timer_only', durationReliability: 'high', distanceReliability: 'unknown', observedWindow: { start: null, end: null }, ...change });
const input = (records: WorkoutCompletionRecord[], change: Partial<Beginner5kAdaptationInput> = {}): Beginner5kAdaptationInput => {
  const analyses = records.map((item) => analyzeWorkoutPerformance(item, planned));
  return { policyReference: { policyId: beginner5kAdaptationV01.policyId, version: beginner5kAdaptationV01.version }, planId: 'plan-1', baseRevisionId: 'rev-1', pathwayReference: planned.pathwayReference!, requiredPolicyReferences: ['pack@1'], analyses, weekly: summarizeWeek('2026-11-02', ['session-1'], records, analyses), recent: summarizeRecentTrend(records, analyses), interruptionReported: false, ...change };
};

describe('System E draft adaptation evaluator', () => {
  it('keeps the policy draft-only and cannot authorize proposal requests', () => {
    expect(validateBeginner5kAdaptationPolicy(beginner5kAdaptationV01)).toEqual([]);
    const context = input([record()]); const decision = evaluateBeginner5kAdaptation(context);
    expect(decision).toMatchObject({ decision: 'advance_candidate', productionEligible: false });
    expect(createFutureProposalRequest(context, decision)).toBeNull();
    const hold = evaluateBeginner5kAdaptation(input([record({ discomfort: 'pain_or_injury_concern' })]));
    expect(createFutureProposalRequest(input([record({ discomfort: 'pain_or_injury_concern' })]), hold)).toBeNull();
  });

  it('uses deterministic precedence: health then integrity then fatigue/interruption then missing evidence', () => {
    expect(evaluateBeginner5kAdaptation(input([record({ discomfort: 'pain_or_injury_concern', fatigue: 'unusual' })]))).toMatchObject({ decision: 'hold_for_review', healthHold: true, reasonCodes: ['health_concern_reported'] });
    expect(evaluateBeginner5kAdaptation(input([record({ actualDurationSeconds: -1, fatigue: 'unusual' })]))).toMatchObject({ decision: 'hold_for_review', reasonCodes: ['critical_data_integrity_issue'] });
    expect(evaluateBeginner5kAdaptation(input([record({ fatigue: 'unusual' })]))).toMatchObject({ decision: 'hold_for_review', reasonCodes: ['interruption_or_unusual_fatigue_requires_review'] });
    expect(evaluateBeginner5kAdaptation(input([], { weekly: { weekStart: '2026-11-02', scheduledWorkouts: 1, reportedOutcomes: 0, completed: 0, partial: 0, missed: 0, differentActivity: 0, unreported: 1, healthHoldSignal: false, dataQualityIssues: [], currentOutcomeRecordIds: [] }, recent: emptyTrend() }))).toMatchObject({ decision: 'insufficient_evidence' });
  });

  it('separates one difficult workout from a repeated difficult pattern', () => {
    expect(evaluateBeginner5kAdaptation(input([record({ difficulty: 'challenging' })]))).toMatchObject({ decision: 'insufficient_evidence', reasonCodes: ['challenging_feedback_not_covered_by_draft_policy'] });
    expect(evaluateBeginner5kAdaptation(input([record({ difficulty: 'too_difficult' })]))).toMatchObject({ decision: 'maintain_candidate', reasonCodes: ['isolated_difficult_feedback_no_decline_inference'] });
    const first = record({ activityLogId: 'one', difficulty: 'too_difficult' }); const second = record({ activityLogId: 'two', workoutId: 'session-2', difficulty: 'too_difficult' });
    const context = input([first, second], { weekly: { weekStart: '2026-11-02', scheduledWorkouts: 1, reportedOutcomes: 1, completed: 1, partial: 0, missed: 0, differentActivity: 0, unreported: 0, healthHoldSignal: false, dataQualityIssues: [], currentOutcomeRecordIds: ['one'] } });
    expect(evaluateBeginner5kAdaptation(context)).toMatchObject({ decision: 'reduce_candidate', reasonCodes: ['repeated_difficult_pattern_draft_rule'] });
  });

  it('handles partial and missed outcomes without make-up work, and preserves policy gaps', () => {
    expect(evaluateBeginner5kAdaptation(input([record({ status: 'partial' })]))).toMatchObject({ decision: 'repeat_candidate', reasonCodes: expect.arrayContaining(['partial_workout_reported', 'no_make_up_workload']) });
    expect(evaluateBeginner5kAdaptation(input([record({ status: 'missed', actualDurationSeconds: null })]))).toMatchObject({ decision: 'repeat_candidate', reasonCodes: expect.arrayContaining(['missed_workout_reported']) });
    const mismatched = input([record({ policyReferences: ['old@1'] })]);
    expect(evaluateBeginner5kAdaptation(mismatched)).toMatchObject({ decision: 'policy_gap' });
    expect(evaluateBeginner5kAdaptation({ ...input([record()]), policyReference: { policyId: 'missing', version: '0' } })).toMatchObject({ decision: 'policy_gap', reasonCodes: ['adaptation_policy_version_unavailable'] });
  });
});

function emptyTrend() { return { consideredWorkoutIds: [], statusCounts: { unreported: 0, completed: 0, partial: 0, missed: 0, different_activity: 0 }, difficultyCounts: { comfortable: 0, too_easy: 0, challenging: 0, too_difficult: 0, unknown: 0 }, healthHoldSignal: false, unknownEvidenceCount: 0 }; }
