import { evaluateBeginner5kCandidateCompatibility, type Beginner5kCandidateEvidence } from '@/domain/planning/evaluateBeginner5kCandidateCompatibility';
import { beginner5kContinuousCandidatePersonalizationPolicy, first5kFixedBaselinePersonalizationPolicy } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { beginner5kWorkloadCompatibilityV04, validateBeginner5kWorkloadCompatibilityPolicy } from '@/domain/planning/beginner5kWorkloadCompatibilityPolicy';

const pathway = (policy: typeof first5kFixedBaselinePersonalizationPolicy, id: string) => {
  const found = policy.pathways.find((candidate) => candidate.id === id); if (!found) throw new Error('Fixture pathway missing'); return found;
};
const evidence = (change: Partial<Beginner5kCandidateEvidence> = {}): Beginner5kCandidateEvidence => ({
  adultAgeConfirmed: true, canWalk30MinutesComfortably: true, healthConcern: false, interruption: 'none', planStartDate: '2026-11-02', availableDays: [1, 3, 6], weekdayMinuteLimits: { 1: 60, 3: 60, 6: 60 }, continuousRunMinutes: 20, weeklyRunningMinutes: 50, longestRecentSessionMinutes: 20, historyAgeDays: 7, longestSessionAgeDays: 7, ...change,
});

describe('beginner 5K v0.4 candidate workload compatibility policy', () => {
  const runWalk = pathway(first5kFixedBaselinePersonalizationPolicy, 'true_beginner_fixed_12_week_run_walk');
  const continuous = pathway(beginner5kContinuousCandidatePersonalizationPolicy, 'continuous_running_beginner_fixed_12_week');

  it('validates as a draft-only policy and cannot represent release approval', () => {
    expect(validateBeginner5kWorkloadCompatibilityPolicy(beginner5kWorkloadCompatibilityV04)).toEqual([]);
    expect(beginner5kWorkloadCompatibilityV04).toMatchObject({ lifecycle: 'draft', releaseEligibility: 'blocked', reviewer: null });
  });

  it('allows a first-time runner only as a draft simulation candidate', () => {
    const result = evaluateBeginner5kCandidateCompatibility(runWalk, evidence({ continuousRunMinutes: null, weeklyRunningMinutes: null, longestRecentSessionMinutes: null, historyAgeDays: null, longestSessionAgeDays: null }));
    expect(result).toMatchObject({ outcome: 'candidate_compatible_draft_only', productionEligible: false });
  });

  it('records a continuous-running profile that meets every proposed candidate comparator', () => {
    const result = evaluateBeginner5kCandidateCompatibility(continuous, evidence());
    expect(result).toMatchObject({ outcome: 'candidate_compatible_draft_only', productionEligible: false });
  });

  it('reports capacity, weekly history, and longest-session gaps by their exact candidate rules', () => {
    const result = evaluateBeginner5kCandidateCompatibility(continuous, evidence({ continuousRunMinutes: 10, weeklyRunningMinutes: 40, longestRecentSessionMinutes: 10 }));
    expect(result).toMatchObject({ outcome: 'requires_review' });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['continuous_capacity_below_candidate_minimum', 'weekly_running_minutes_below_candidate_minimum', 'longest_session_below_candidate_minimum']));
  });

  it('keeps missing, contradictory, old, interrupted, health, and time-budget evidence distinct', () => {
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weeklyRunningMinutes: null }))).toMatchObject({ outcome: 'insufficient_information', reasonCodes: ['missing_weekly_running_minutes'] });
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weeklyRunningMinutes: 10, longestRecentSessionMinutes: 20 }))).toMatchObject({ outcome: 'requires_review', reasonCodes: expect.arrayContaining(['weekly_running_minutes_below_candidate_minimum']) });
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ historyAgeDays: 29 }))).toMatchObject({ outcome: 'insufficient_information', reasonCodes: ['outdated_running_history'] });
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ interruption: 'under_1_week' }))).toMatchObject({ outcome: 'requires_review', reasonCodes: ['interruption_requires_review'] });
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ healthConcern: true }))).toMatchObject({ outcome: 'health_hold', reasonCodes: ['health_concern_reported'] });
    expect(evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weekdayMinuteLimits: { 1: 20, 3: 60, 6: 60 } }))).toMatchObject({ outcome: 'scheduling_incompatible', reasonCodes: ['weekday_time_limit_below_prescribed_session'] });
  });

  it('only calls aggregate and longest-session values contradictory when definitions and windows are exactly compatible', () => {
    const sameWindow = { start: '2026-10-01', end: '2026-10-08' };
    const contradictory = evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weeklyRunningMinutes: 10, longestRecentSessionMinutes: 20, weeklyRunningObservation: { valueMinutes: 10, window: sameWindow, unit: 'minutes', aggregation: 'weekly_total', includesLongestSession: true }, longestSessionObservation: { valueMinutes: 20, window: sameWindow, unit: 'minutes', aggregation: 'single_session' } }));
    expect(contradictory).toMatchObject({ outcome: 'conflicting_evidence', reasonCodes: ['longest_session_exceeds_weekly_running_minutes'] });
    const average = evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weeklyRunningMinutes: 10, longestRecentSessionMinutes: 20, weeklyRunningObservation: { valueMinutes: 10, window: sameWindow, unit: 'minutes', aggregation: 'weekly_average', includesLongestSession: true }, longestSessionObservation: { valueMinutes: 20, window: sameWindow, unit: 'minutes', aggregation: 'single_session' } }));
    expect(average.reasonCodes).not.toContain('longest_session_exceeds_weekly_running_minutes');
    const overlapping = evaluateBeginner5kCandidateCompatibility(continuous, evidence({ weeklyRunningMinutes: 10, longestRecentSessionMinutes: 20, weeklyRunningObservation: { valueMinutes: 10, window: { start: '2026-10-01', end: '2026-10-08' }, unit: 'minutes', aggregation: 'weekly_total', includesLongestSession: true }, longestSessionObservation: { valueMinutes: 20, window: { start: '2026-10-04', end: '2026-10-08' }, unit: 'minutes', aggregation: 'single_session' } }));
    expect(overlapping.reasonCodes).not.toContain('longest_session_exceeds_weekly_running_minutes');
  });
});
