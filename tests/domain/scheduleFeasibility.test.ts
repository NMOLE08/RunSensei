import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { continuous5kWorkoutPolicyPack } from '@/domain/planning/continuous5kPolicyPack';
import { bundledDraft5kProgramRegistry } from '@/domain/planning/draft5kProgramRegistry';
import { evaluateScheduleFeasibility } from '@/domain/planning/evaluateScheduleFeasibility';
import { normalizeRunnerConstraints, nextMondayOnOrAfter } from '@/domain/planning/runnerConstraints';
import { createExperimental5kPreview, serializeExperimental5kPreview } from '@/domain/research/experimental5kPreview';

const draft = (change = {}) => ({
  ...emptyFitnessAssessmentDraft('runner-a', 'Asia/Kolkata'), adultAgeConfirmed: true, canWalk30MinutesComfortably: true,
  first5kExperience: 'substantial' as const, healthConcern: false, interruption: 'none' as const, goal: '5k' as const, goalFocus: 'finish' as const,
  planStartDate: '2027-01-02', trainingDays: [1, 3, 6], minuteLimits: { 1: '45', 3: '45', 6: '45' }, minuteLimitConfirmedDays: [1, 3, 6],
  comfortableRunMinutes: '30', weeklyMinutes: '60', weeklyDistance: '10', longestSessionMinutes: '60', longestSessionDate: '2026-10-28',
  ...change,
});
const run = (value = draft()) => createExperimental5kPreview({ ownerId: value.ownerId, draft: value, assessment: assessFitness(value, '2026-11-05T12:00:00.000Z'), nowDate: '2026-11-05' });

describe('constraint-aware draft scheduling', () => {
  it('anchors a Saturday request to the following Monday without scheduling before it', () => {
    expect(nextMondayOnOrAfter('2027-01-02')).toBe('2027-01-04');
    const value = draft({ minuteLimits: { 1: '60', 3: '60', 6: '60' } }); const result = run(value);
    expect(result).toMatchObject({ kind: 'preview', scheduleAnchor: '2027-01-04' });
    if (result.kind === 'preview') { expect(result.sessions[0]?.date).toBe('2027-01-05'); expect(result.sessions.every((item) => item.date >= value.planStartDate)).toBe(true); }
  });

  it('rejects an unsupported half-marathon goal before 5K candidate scheduling', () => {
    const result = run(draft({ goal: 'half_marathon' as const }));
    expect(result).toMatchObject({ kind: 'blocked', reasonCodes: ['unsupported_policy_family'], feasibility: null, strictProductionGate: { kind: 'not_eligible', reasonCodes: ['goal_not_supported'] } });
  });

  it('reports the exact 45-minute Week 11 extended-session conflict', () => {
    const program = bundledDraft5kProgramRegistry.resolve(continuous5kWorkoutPolicyPack)!;
    const result = { kind: 'blocked', feasibility: evaluateScheduleFeasibility(program, normalizeRunnerConstraints(draft())) };
    if (result.kind !== 'blocked' || result.feasibility?.kind !== 'infeasible') throw new Error('Expected feasibility conflict');
    expect(result.feasibility.conflicts).toContainEqual(expect.objectContaining({ week: 11, workout: 'C', requiredMinutes: 46, availableMinutes: 45, weekday: 6, policyReference: `${continuous5kWorkoutPolicyPack.policyId}@${continuous5kWorkoutPolicyPack.version}` }));
  });

  it('does not treat the automatically inserted 45-minute value as confirmed intent', () => {
    const program = bundledDraft5kProgramRegistry.resolve(continuous5kWorkoutPolicyPack)!;
    const result = { kind: 'blocked', feasibility: evaluateScheduleFeasibility(program, normalizeRunnerConstraints(draft({ minuteLimitConfirmedDays: [] }))) };
    if (result.kind !== 'blocked' || result.feasibility?.kind !== 'infeasible') throw new Error('Expected unconfirmed limit');
    expect(result.feasibility.conflicts[0]).toMatchObject({ code: 'unconfirmed_time_limit', availableMinutes: 45 });
  });

  it('searches alternative three-day subsets when four days are available', () => {
    const value = draft({ trainingDays: [0, 2, 4, 6], minuteLimits: { 0: '30', 2: '60', 4: '60', 6: '60' }, minuteLimitConfirmedDays: [0, 2, 4, 6] });
    const program = bundledDraft5kProgramRegistry.resolve(continuous5kWorkoutPolicyPack); if (!program) throw new Error('Programme missing');
    const result = evaluateScheduleFeasibility(program, normalizeRunnerConstraints(value));
    expect(result).toMatchObject({ kind: 'feasible', selectedWeekdays: [2, 4, 6], frequency: { status: 'scheduling_options' } });
    if (result.kind === 'feasible') expect(result.attempts.some((item) => !item.feasible)).toBe(true);
  });

  it('uses the preferred weekday for a unique complete longest session when the authored ordering permits it', () => {
    const value = draft({ preferredLongDay: 6, minuteLimits: { 1: '60', 3: '60', 6: '60' } });
    const program = bundledDraft5kProgramRegistry.resolve(continuous5kWorkoutPolicyPack); if (!program) throw new Error('Programme missing');
    const result = evaluateScheduleFeasibility(program, normalizeRunnerConstraints(value));
    expect(result).toMatchObject({ kind: 'feasible', selectedWeekdays: [1, 3, 6] });
    if (result.kind === 'feasible') {
      const weekOne = result.simulation.sessions.filter((session) => session.week === 1);
      const longest = [...weekOne].sort((left, right) => (right.durationSeconds ?? -1) - (left.durationSeconds ?? -1))[0]!;
      expect(new Date(`${longest.date}T00:00:00Z`).getUTCDay()).toBe(0);
      expect(result.warnings).toContain('longest_workout_preference_ambiguous_weeks:12');
    }
  });

  it('keeps recovery and authored session order ahead of an impossible longest-workout preference', () => {
    const value = draft({ trainingDays: [0, 2, 4, 6], preferredLongDay: 0, minuteLimits: { 0: '60', 2: '60', 4: '60', 6: '60' }, minuteLimitConfirmedDays: [0, 2, 4, 6] });
    const program = bundledDraft5kProgramRegistry.resolve(continuous5kWorkoutPolicyPack); if (!program) throw new Error('Programme missing');
    const result = evaluateScheduleFeasibility(program, normalizeRunnerConstraints(value));
    expect(result).toMatchObject({ kind: 'feasible' });
    if (result.kind === 'feasible') expect(result.warnings).toContain('preferred_longest_day_not_used_due_to_recovery_or_authored_session_order');
  });

  it('keeps two-day availability as an explicit policy gap and fixed dates exact', () => {
    expect(run(draft({ trainingDays: [1, 4], minuteLimits: { 1: '60', 4: '60' }, minuteLimitConfirmedDays: [1, 4] }))).toMatchObject({ kind: 'blocked', reasonCodes: ['two_day_policy_not_authored'] });
    const fixed = run(draft({ goalDateFixed: true, goalDate: '2027-03-29', minuteLimits: { 1: '60', 3: '60', 6: '60' } }));
    expect(fixed).toMatchObject({ kind: 'blocked', reasonCodes: ['fixed_goal_date_conflict'] });
  });

  it('serializes deterministic research diagnostics without an active plan', () => {
    const first = run(); const second = run(); expect(serializeExperimental5kPreview(first)).toBe(serializeExperimental5kPreview(second));
    const json = serializeExperimental5kPreview(first); expect(JSON.parse(json)).toMatchObject({ researchOnly: true, productionEligible: false, ownerId: '[account-scoped]' }); expect(json).not.toContain('runner-a'); expect(json).not.toContain('activeRevisionId');
  });
});
