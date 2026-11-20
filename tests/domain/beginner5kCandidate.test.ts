import { assessBeginner5kCandidate, candidateSessionsForTier, candidateWeekResponse, createBeginner5kCandidatePolicy } from '@/domain/training/beginner5kCandidate';

const facts = (overrides = {}) => ({ goalDistanceMeters: 5000, comfortableDurationMinutes: 25, recentWeeklyMinutes: 35, longestRepeatableMinutes: 20, interruption: 'none' as const, concern: false, availableWeekdays: [0, 2, 5], minuteLimits: { 0: 45, 2: 45, 5: 50 }, weekNumber: 1, daysUntilGoal: 70, difficultyPreference: 'balanced' as const, ...overrides });

describe('beginner-to-5K candidate policy', () => {
  test('requires actual baseline, goal, recovery-spaced availability, and feasible date', () => {
    expect(assessBeginner5kCandidate(facts())).toMatchObject({ kind: 'eligible', tier: 'intro_walk_run' });
    expect(assessBeginner5kCandidate(facts({ comfortableDurationMinutes: null }))).toMatchObject({ kind: 'ineligible', issues: ['insufficient_baseline'] });
    expect(assessBeginner5kCandidate(facts({ availableWeekdays: [0, 1, 2] }))).toMatchObject({ kind: 'ineligible', issues: ['availability_incompatible'] });
    expect(assessBeginner5kCandidate(facts({ daysUntilGoal: 55 }))).toMatchObject({ kind: 'ineligible', issues: ['goal_date_incompatible'] });
    expect(assessBeginner5kCandidate(facts({ concern: true }))).toMatchObject({ kind: 'ineligible', issues: ['health_hold'] });
  });

  test('changes only within authored tiers and never uses preference to advance early', () => {
    expect(assessBeginner5kCandidate(facts({ weekNumber: 8, difficultyPreference: 'comfortable' }))).toMatchObject({ kind: 'eligible', tier: 'transition_walk_run', repeatWeek: true });
    expect(assessBeginner5kCandidate(facts({ weekNumber: 8, difficultyPreference: 'challenging' }))).toMatchObject({ kind: 'eligible', tier: 'continuous_run', repeatWeek: false });
  });

  test('defines complete timed sessions whose totals reconcile with the bounded policy', () => {
    for (const tier of ['intro_walk_run', 'build_walk_run', 'transition_walk_run', 'continuous_run'] as const) {
      const policy = createBeginner5kCandidatePolicy(tier); const sessions = candidateSessionsForTier(tier);
      expect(policy.contentStatus).toBe('draft'); expect(policy.reviewed).toBe(false); expect(policy.minRunDays).toBe(3); expect(policy.minLongRuns).toBe(1);
      for (const session of sessions) expect(session.steps.reduce((sum, step) => sum + step.range.min * step.minRepeats, 0)).toBe(session.total);
    }
  });

  test('never makes up missed work and sends concerns to their separate path', () => {
    expect(candidateWeekResponse({ missedSessions: 1, harderThanExpectedSessions: 0, concern: false, sustainedInterruption: false })).toBe('repeat_current_week');
    expect(candidateWeekResponse({ missedSessions: 0, harderThanExpectedSessions: 0, concern: true, sustainedInterruption: false })).toBe('health_hold');
  });
});
