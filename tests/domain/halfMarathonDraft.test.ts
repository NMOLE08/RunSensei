import { createHalfMarathonDraftPolicy, serializeHalfMarathonResearchSimulation, simulateHalfMarathonDraft, validateParameterizedHalfMarathonPolicy } from '@/domain/planning/halfMarathonDraft';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';

const days3 = [{ weekday: 1, maxMinutes: 75, confirmedByRunner: true }, { weekday: 3, maxMinutes: 75, confirmedByRunner: true }, { weekday: 6, maxMinutes: 100, confirmedByRunner: true }];
const days4 = [{ weekday: 0, maxMinutes: 60, confirmedByRunner: true }, { weekday: 1, maxMinutes: 60, confirmedByRunner: true }, { weekday: 3, maxMinutes: 70, confirmedByRunner: true }, { weekday: 6, maxMinutes: 140, confirmedByRunner: true }];
function input(overrides = {}) { return { ownerId: 'fixture-a', weeklyMinutes: 110, longestSessionMinutes: 45, comfortableRunMinutes: 40, weeklyEvidenceObservedAt: '2027-01-02' as const, longestSessionDate: '2027-01-02' as const, asOfDate: '2027-01-04' as const, interruption: 'none' as const, healthConcern: false, availableDays: days3, unavailableDates: [], preferredLongRunDay: 6, startDate: '2027-01-04' as const, fixedGoalDate: null, ...overrides }; }

describe('half-marathon draft research generator', () => {
  it('generates a complete 10-week foundation candidate with recovery weeks and unknown event duration', () => {
    const result = simulateHalfMarathonDraft(input());
    expect(result.kind).toBe('simulation'); if (result.kind === 'simulation') { expect(result.policy.version).toBe('0.2.0-draft'); expect(result.band).toBe('foundation_3_day'); expect(result.weeks).toHaveLength(10); expect(result.weeks[0]?.targetWeeklyMinutes).toBe(110); expect(result.weeks[3]?.recoveryWeek).toBe(true); expect(result.weeks[7]?.recoveryWeek).toBe(true); expect(result.weeks[9]?.workouts.find((item) => item.role === 'event')?.target).toEqual({ kind: 'distance_meters', value: 21097.5 }); expect(result.validation).toEqual({ valid: true, issues: [] }); }
  });
  it('selects a different workload and 4-day workout structure for established evidence', () => {
    const result = simulateHalfMarathonDraft(input({ weeklyMinutes: 180, longestSessionMinutes: 70, availableDays: days4 }));
    expect(result.kind).toBe('simulation'); if (result.kind === 'simulation') { expect(result.band).toBe('established_4_day'); expect(result.weeks[0]?.workouts).toHaveLength(4); expect(result.weeks[0]?.weeklyMinutes).toBe(180); expect(result.weeks[0]?.longRunMinutes).toBe(70); expect(result.weeks[0]?.workouts.some((item) => item.role === 'quality')).toBe(true); }
  });
  it('blocks two-day, inadequate evidence, health and interruption cases explicitly', () => {
    expect(simulateHalfMarathonDraft(input({ availableDays: days3.slice(0, 2) })).kind).toBe('blocked');
    expect(simulateHalfMarathonDraft(input({ weeklyMinutes: 50, longestSessionMinutes: 20 }))).toMatchObject({ reasonCodes: expect.arrayContaining(['requires_foundation_phase', 'below_minimum_weekly_minutes']) });
    expect(simulateHalfMarathonDraft(input({ healthConcern: true }))).toMatchObject({ reasonCodes: ['health_hold'] });
    expect(simulateHalfMarathonDraft(input({ interruption: 'one_to_four_weeks' }))).toMatchObject({ reasonCodes: ['interruption_requires_review'] });
  });
  it('reports fixed event dates that cannot align with the authored calendar', () => {
    expect(simulateHalfMarathonDraft(input({ fixedGoalDate: '2027-03-13' as const }))).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['fixed_goal_date_conflict']) });
  });
  it('does not authorize the candidate policy for publication', () => {
    const policy = createHalfMarathonDraftPolicy('foundation_3_day');
    expect(policy.releaseAuthorized).toBe(false);
    expect(new MultiDistancePolicyRegistry([policy]).resolve(policy.id, policy.version, 'half_marathon', true)).toMatchObject({ kind: 'unavailable', code: 'policy_not_authorized' });
  });
  it('returns deterministic, explicitly research-only JSON', () => {
    expect(serializeHalfMarathonResearchSimulation(simulateHalfMarathonDraft(input()))).toBe(serializeHalfMarathonResearchSimulation(simulateHalfMarathonDraft(input())));
  });
  it('calculates different numerical workloads for two foundation runners instead of choosing a fixed array', () => {
    const lower = simulateHalfMarathonDraft(input({ weeklyMinutes: 100, longestSessionMinutes: 42 }));
    const higher = simulateHalfMarathonDraft(input({ weeklyMinutes: 130, longestSessionMinutes: 52 }));
    expect(lower.kind).toBe('simulation'); expect(higher.kind).toBe('simulation');
    if (lower.kind === 'simulation' && higher.kind === 'simulation') {
      expect(lower.band).toBe('foundation_3_day'); expect(higher.band).toBe('foundation_3_day');
      expect(lower.weeks[0]?.targetWeeklyMinutes).toBe(100); expect(higher.weeks[0]?.targetWeeklyMinutes).toBe(130);
      expect(lower.weeks[0]?.targetLongRunMinutes).toBe(40); expect(higher.weeks[0]?.targetLongRunMinutes).toBe(50);
      expect(lower.weeks[6]?.targetWeeklyMinutes).not.toBe(higher.weeks[6]?.targetWeeklyMinutes);
    }
  });
  it('distinguishes an authored ten-week window from too-short and unsupported-long fixed dates', () => {
    expect(simulateHalfMarathonDraft(input({ fixedGoalDate: '2027-03-14' as const }))).toMatchObject({ kind: 'simulation' });
    expect(simulateHalfMarathonDraft(input({ startDate: '2027-01-02' as const, fixedGoalDate: '2027-03-14' as const }))).toMatchObject({ kind: 'simulation' });
    expect(simulateHalfMarathonDraft(input({ fixedGoalDate: '2027-02-28' as const }))).toMatchObject({ reasonCodes: ['goal_date_infeasible'] });
    expect(simulateHalfMarathonDraft(input({ fixedGoalDate: '2027-03-21' as const }))).toMatchObject({ reasonCodes: ['unsupported_preparation_duration'] });
  });
  it('uses reliable imported evidence only when explicitly provided and reports conflicting evidence', () => {
    const imported = simulateHalfMarathonDraft(input({ evidence: [{ id: 'strava:summary:1', kind: 'strava_import' as const, observedAt: '2027-01-03' as const, weeklyMinutes: 130, weeklyWindowDays: 28, longestSessionMinutes: 50, consistencyWeeks: 4, reliability: 'reliable' as const, conflictsWithAnotherSource: false }] }));
    expect(imported).toMatchObject({ kind: 'simulation' });
    if (imported.kind === 'simulation') expect(imported.diagnostics.evidence.find((item) => item.id === 'strava:summary:1')?.usedFor).toEqual(['weekly_minutes', 'longest_session']);
    expect(simulateHalfMarathonDraft(input({ evidence: [{ id: 'strava:summary:conflict', kind: 'strava_import' as const, observedAt: '2027-01-03' as const, weeklyMinutes: 130, weeklyWindowDays: 28, longestSessionMinutes: 50, consistencyWeeks: 4, reliability: 'reliable' as const, conflictsWithAnotherSource: true }] }))).toMatchObject({ reasonCodes: ['conflicting_evidence'] });
  });
  it('reports foundation, stale evidence, and time-limit failures without fabricating a workout', () => {
    expect(simulateHalfMarathonDraft(input({ comfortableRunMinutes: 10 }))).toMatchObject({ reasonCodes: expect.arrayContaining(['requires_foundation_phase', 'below_minimum_comfortable_run_minutes']) });
    expect(simulateHalfMarathonDraft(input({ asOfDate: '2027-02-10' as const }))).toMatchObject({ reasonCodes: ['outdated_evidence'] });
    expect(simulateHalfMarathonDraft(input({ availableDays: days3.map((day) => ({ ...day, maxMinutes: 20 })) }))).toMatchObject({ reasonCodes: expect.arrayContaining(['session_exceeds_time_limit']) });
  });
  it('tracks weekly aggregate freshness separately from the longest-session date', () => {
    const staleWeekly = simulateHalfMarathonDraft(input({ weeklyEvidenceObservedAt: '2026-11-01' as const, longestSessionDate: '2027-01-03' as const }));
    expect(staleWeekly).toMatchObject({ kind: 'blocked', reasonCodes: ['outdated_evidence'] });
    if (staleWeekly.kind === 'blocked') {
      expect(staleWeekly.diagnostics.freshness).toMatchObject({ evaluationDate: '2027-01-04', weeklyObservationDate: '2026-11-01', longestSessionObservationDate: '2027-01-03', weeklyEvidenceAgeDays: 64, longestSessionEvidenceAgeDays: 1, thresholdDays: 28, comparability: 'separate_aggregate_and_session' });
    }
  });
  it('accepts freshly confirmed evidence without changing either observed date during evaluation', () => {
    const result = simulateHalfMarathonDraft(input({ weeklyEvidenceObservedAt: '2027-01-04' as const, longestSessionDate: '2027-01-03' as const }));
    expect(result).toMatchObject({ kind: 'simulation' });
    if (result.kind === 'simulation') expect(result.diagnostics.freshness).toMatchObject({ weeklyObservationDate: '2027-01-04', longestSessionObservationDate: '2027-01-03', weeklyEvidenceAgeDays: 0, longestSessionEvidenceAgeDays: 1 });
  });
  it('does not infer a conflict from a weekly aggregate and an individual longest session', () => {
    const result = simulateHalfMarathonDraft(input({ weeklyMinutes: 50, longestSessionMinutes: 75, weeklyEvidenceObservedAt: '2027-01-03' as const, longestSessionDate: '2027-01-03' as const }));
    expect(result).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['requires_foundation_phase']) });
    expect(result).not.toMatchObject({ reasonCodes: expect.arrayContaining(['conflicting_evidence']) });
    if (result.kind === 'blocked') expect(result.diagnostics.nextApplicableRule).toContain('requires_foundation_phase');
  });
  it('requires an explicit weekly observation confirmation instead of refreshing it while evaluating', () => {
    const result = simulateHalfMarathonDraft(input({ weeklyEvidenceObservedAt: null }));
    expect(result).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['insufficient_evidence', 'missing_weekly_evidence_confirmation']) });
    if (result.kind === 'blocked') expect(result.diagnostics.freshness.weeklyObservationDate).toBeNull();
  });
  it('keeps the parameterized policy draft-only and internally complete', () => {
    expect(validateParameterizedHalfMarathonPolicy()).toEqual([]);
    expect(createHalfMarathonDraftPolicy('foundation_3_day')).toMatchObject({ version: '0.2.0-draft', releaseAuthorized: false });
  });
});
