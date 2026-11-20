import { developerTrainingLabReason, isDeveloperTrainingLabEnabled } from '@/config/developerTrainingLab';
import { assignmentChangeKind, createTrainingLabFixture, describeSessionSteps, explainComparison, explainReasonCode, performanceRowsForLab, presentWorkoutSteps, runTrainingLabFixture, sessionsForLabWeek, summarizeAdaptationPreview, trainingLabFixtures, trainingLabScenarios } from '@/domain/research/trainingLab';
import { runBeginner5kResearchSimulation } from '@/domain/research/runBeginner5kResearchSimulation';

describe('developer-only Training Lab', () => {
  it('requires both a development build and the explicit public opt-in', () => {
    expect(isDeveloperTrainingLabEnabled({ isDevelopment: false, trainingLabFlag: 'true' })).toBe(false);
    expect(isDeveloperTrainingLabEnabled({ isDevelopment: true, trainingLabFlag: undefined })).toBe(false);
    expect(isDeveloperTrainingLabEnabled({ isDevelopment: true, trainingLabFlag: 'false' })).toBe(false);
    expect(isDeveloperTrainingLabEnabled({ isDevelopment: true, trainingLabFlag: 'true' })).toBe(true);
    expect(developerTrainingLabReason({ isDevelopment: false, trainingLabFlag: 'true' })).toContain('production');
  });

  it('does not construct a fixture or execute the harness when direct route access is disabled', () => {
    const runner = jest.fn(runBeginner5kResearchSimulation);
    const result = runTrainingLabFixture(false, 'run_walk_flexible', 'completed_week', runner);
    expect(result).toMatchObject({ kind: 'disabled' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('keeps predefined synthetic fixtures isolated and supports both draft pathways', () => {
    expect(trainingLabFixtures.map((item) => item.id)).toEqual(['run_walk_flexible', 'continuous_flexible', 'run_walk_fixed_goal', 'continuous_fixed_goal']);
    expect(trainingLabScenarios).toHaveLength(12);
    const runWalk = createTrainingLabFixture('run_walk_flexible', 'completed_week');
    const continuous = createTrainingLabFixture('continuous_flexible', 'completed_week');
    expect(runWalk.pathwayId).toBe('true_beginner_fixed_12_week_run_walk');
    expect(continuous.pathwayId).toBe('continuous_running_beginner_fixed_12_week');
    expect(runWalk.id).toContain('training-lab:');
    expect(runWalk.strictInput).not.toHaveProperty('accountId');
    expect(runWalk).not.toHaveProperty('sqlite');
  });

  it('returns calendar and expanded authored step data without duplicating planning logic', () => {
    const run = runTrainingLabFixture(true, 'run_walk_flexible', 'completed_week');
    expect(run.kind).toBe('result');
    if (run.kind !== 'result') return;
    expect(run.value).toMatchObject({ researchOnly: true, productionEligible: false, calendar: { totalWeeks: 12 } });
    expect(run.value.calendar.sessions).toHaveLength(36);
    const firstWeek = sessionsForLabWeek(run.value, 1);
    expect(firstWeek).toHaveLength(3);
    expect(describeSessionSteps(firstWeek[0]!)).toEqual(expect.arrayContaining([expect.stringContaining('warmup'), expect.stringContaining('run'), expect.stringContaining('walk'), expect.stringContaining('cooldown')]));
    const event = sessionsForLabWeek(run.value, 12).find((session) => session.code === 'C');
    expect(event).toMatchObject({ distanceMeters: 5000, durationSeconds: null });
    expect(describeSessionSteps(event!)).toEqual(expect.arrayContaining([expect.stringContaining('duration remains unknown')]));
  });

  it('presents immutable workout steps in compact readable sections without changing authored timing', () => {
    const run = runTrainingLabFixture(true, 'run_walk_flexible', 'completed_week');
    expect(run.kind).toBe('result');
    if (run.kind !== 'result') return;
    const first = sessionsForLabWeek(run.value, 1)[0]!;
    expect(presentWorkoutSteps(first)).toEqual([
      { label: 'Warm-up', detail: '5 min · effort 1-3' },
      { label: 'Run', detail: '1 min × 6 · effort 3-4' },
      { label: 'Walking recovery', detail: '2 min × 6 · effort 1-3' },
      { label: 'Cooldown', detail: '5 min · effort 1-3' },
    ]);
    const event = sessionsForLabWeek(run.value, 12).find((item) => item.code === 'C')!;
    expect(presentWorkoutSteps(event)[1]).toEqual(expect.objectContaining({ label: '5K completion event', detail: expect.stringContaining('duration is unknown') }));
  });

  it('exposes factual System D and draft System E output for selected outcome scenarios', () => {
    const difficult = runTrainingLabFixture(true, 'continuous_flexible', 'repeated_difficult');
    expect(difficult.kind).toBe('result');
    if (difficult.kind !== 'result') return;
    expect(difficult.value.analyses).toHaveLength(3);
    expect(difficult.value.analyses[0]!.evidenceIds.length).toBeGreaterThan(0);
    expect(difficult.value.adaptation).toMatchObject({ decision: 'reduce_candidate', productionEligible: false });
    expect(difficult.value.preview).toMatchObject({ kind: 'policy_gap', productionEligible: false });

    const pain = runTrainingLabFixture(true, 'run_walk_flexible', 'pain');
    expect(pain.kind).toBe('result');
    if (pain.kind !== 'result') return;
    expect(pain.value.adaptation).toMatchObject({ decision: 'hold_for_review', healthHold: true });
  });

  it('renders every planned assignment, including an unreported assignment without inventing an activity record', () => {
    const run = runTrainingLabFixture(true, 'run_walk_flexible', 'unreported');
    expect(run.kind).toBe('result');
    if (run.kind !== 'result') return;
    const rows = performanceRowsForLab(run.value);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.label)).toEqual(['Week 3 · Workout A', 'Week 3 · Workout B', 'Week 3 · Workout C']);
    const unreported = rows.find((row) => row.currentOutcome === null);
    expect(unreported).toMatchObject({ label: 'Week 3 · Workout C', currentOutcome: null, currentAnalysis: null });
    expect(run.value.completions).toHaveLength(2);
  });

  it('shows only the current correction by default while retaining superseded outcome provenance', () => {
    const run = runTrainingLabFixture(true, 'run_walk_flexible', 'corrected');
    expect(run.kind).toBe('result');
    if (run.kind !== 'result') return;
    const first = performanceRowsForLab(run.value)[0]!;
    expect(first.label).toBe('Week 3 · Workout A');
    expect(first.currentOutcome?.actualDurationSeconds).toBe(2040);
    expect(first.supersededOutcomes).toHaveLength(1);
    expect(first.supersededOutcomes[0]?.actualDurationSeconds).toBe(1980);
    expect(run.value.weekly.completed).toBe(3);
  });

  it('shows research-only before/after comparison data and preserves final event/history', () => {
    const repeat = runTrainingLabFixture(true, 'run_walk_flexible', 'partial');
    expect(repeat.kind).toBe('result');
    if (repeat.kind !== 'result' || repeat.value.preview.kind !== 'preview') return;
    expect(repeat.value.preview).toMatchObject({ transformation: 'repeat_stage', productionEligible: false });
    expect(repeat.value.preview.before).toHaveLength(36);
    expect(repeat.value.preview.after).toHaveLength(39);
    expect(repeat.value.preview.after.filter((item) => item.session.distanceMeters === 5000)).toHaveLength(1);
    expect(repeat.value.preview.after.filter((item) => item.copiedFromSource)).toHaveLength(3);
    const copied = repeat.value.preview.after.find((item) => item.copiedFromSource)!;
    expect(assignmentChangeKind(copied, repeat.value.preview.before)).toBe('repeated');
    expect(repeat.value.preview.validation).toMatchObject({ productionEligible: false, structurallyValid: true });
    expect(repeat.value.provenance.originalAssignmentIds).toHaveLength(36);
    const summary = summarizeAdaptationPreview(repeat.value.preview);
    expect(summary).toMatchObject({ beforeCount: 36, afterCount: 39, repeated: 3, finalEventCount: 1 });
    expect(summary.shifted + summary.unchanged + summary.repeated).toBe(summary.afterCount);
  });

  it('uses readable explanations while retaining the original technical codes in details', () => {
    expect(explainReasonCode('fixed_goal_date_repeat_conflict')).toContain('fixed goal date');
    expect(explainReasonCode('lower_workload_variant_not_authored')).toContain('No authored lower-workload alternative');
    expect(explainComparison({ kind: 'comparable', planned: 2040, actual: 1980, difference: -60 }, 'duration')).toBe('Duration was 1 min shorter than planned.');
    expect(explainComparison({ kind: 'not_comparable', reason: 'planned_distance_unknown' }, 'distance')).toContain('no matching planned distance');
  });

  it('surfaces fixed-date and scheduling conflicts rather than applying a change', () => {
    const fixed = runTrainingLabFixture(true, 'continuous_fixed_goal', 'partial');
    expect(fixed.kind).toBe('result');
    if (fixed.kind !== 'result') return;
    expect(fixed.value.preview).toMatchObject({ kind: 'scheduling_conflict', reasonCodes: ['fixed_goal_date_repeat_conflict'], productionEligible: false });
    const conflict = runTrainingLabFixture(true, 'run_walk_flexible', 'scheduling_conflict');
    expect(conflict.kind).toBe('result');
    if (conflict.kind !== 'result') return;
    expect(conflict.value.preview).toMatchObject({ kind: 'scheduling_conflict', productionEligible: false });
  });
});
