import { assessBeginner5kWorkloadCompatibility } from '@/domain/planning/beginner5kWorkloadCompatibility';
import { beginner5kContinuousCandidatePersonalizationPolicy, first5kFixedBaselinePersonalizationPolicy } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { simulateContinuous5kDraft } from '@/domain/planning/continuous5kPolicyPack';
import { simulateFirst5kDraft } from '@/domain/planning/first5kPolicyPack';

const limits = { 1: 60, 3: 60, 6: 60 };
const pathway = (policy: typeof first5kFixedBaselinePersonalizationPolicy, id: string) => {
  const found = policy.pathways.find((item) => item.id === id); if (!found) throw new Error('Fixture pathway missing'); return found;
};

describe('beginner 5K workload compatibility audit', () => {
  it('does not claim compatibility for the first-time path without reviewed rules', () => {
    const simulation = simulateFirst5kDraft('2026-11-02');
    const result = assessBeginner5kWorkloadCompatibility(pathway(first5kFixedBaselinePersonalizationPolicy, 'true_beginner_fixed_12_week_run_walk'), simulation, { continuousRunMinutes: null, weeklyRunningMinutes: 90, weeklyDistance: null, longestRecentSessionMinutes: 30, weekdayMinuteLimits: limits });
    expect(result).toMatchObject({ kind: 'policy_gap' });
    expect(result.reasonCodes).toContain('starting_workload_compatibility_rule_missing');
    expect(result.audit.week1ExtendedSessionSeconds).toBe(1260);
  });

  it('records capacity below the proposed continuous week-one extended run without calling it safe or unsafe', () => {
    const simulation = simulateContinuous5kDraft('2026-11-02');
    const result = assessBeginner5kWorkloadCompatibility(pathway(beginner5kContinuousCandidatePersonalizationPolicy, 'continuous_running_beginner_fixed_12_week'), simulation, { continuousRunMinutes: 5, weeklyRunningMinutes: 30, weeklyDistance: null, longestRecentSessionMinutes: 10, weekdayMinuteLimits: limits });
    expect(result).toMatchObject({ kind: 'policy_gap' });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['reported_continuous_capacity_below_week1_extended_session', 'starting_workload_compatibility_rule_missing']));
    expect(result.audit.week1ExtendedSessionSeconds).toBe(1200);
  });

  it('blocks a factual weekday time-budget conflict and keeps missing history explicit', () => {
    const simulation = simulateContinuous5kDraft('2026-11-02');
    const result = assessBeginner5kWorkloadCompatibility(pathway(beginner5kContinuousCandidatePersonalizationPolicy, 'continuous_running_beginner_fixed_12_week'), simulation, { continuousRunMinutes: 20, weeklyRunningMinutes: null, weeklyDistance: null, longestRecentSessionMinutes: null, weekdayMinuteLimits: { 1: 20, 3: 60, 6: 60 } });
    expect(result).toMatchObject({ kind: 'scheduling_incompatible' });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['weekday_time_limit_below_prescribed_session', 'missing_recent_weekly_training_evidence', 'missing_longest_recent_session_evidence']));
  });
});
