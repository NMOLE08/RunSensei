import { generateFoundationWeek, validateFoundationWeek, type FoundationCurrentEvidence } from '@/domain/planning/foundationWeek';
import type { MultiDistanceRunnerConstraints } from '@/domain/planning/multiDistancePolicy';

const evidence: FoundationCurrentEvidence = { weeklyRunningMinutes: 50, continuousRunningMinutes: 45, currentFactsConfirmed: true, comfortableWalkingConfirmed: true, context: 'currently_training', noInterruptionConfirmed: true, healthConcern: false };
const constraints: MultiDistanceRunnerConstraints = { ownerId: 'synthetic', goalFamily: 'half_marathon', startDate: '2027-01-04', fixedGoalDate: null, availableDays: [0, 1, 3, 6].map((weekday) => ({ weekday, maxMinutes: 30, confirmedByRunner: true })), unavailableDates: [], preferredLongRunDay: null };
describe('foundation week', () => {
  it('schedules exactly 50 running plus 30 walking minutes on supplied weekdays', () => {
    const result = generateFoundationWeek(evidence, constraints);
    expect(result).toMatchObject({ kind: 'foundation_week', runningSeconds: 3000, walkingSeconds: 1800, totalSeconds: 4800, productionEligible: false, validation: { valid: true } });
    if (result.kind !== 'foundation_week') throw new Error('No preview');
    expect(result.schedule.workouts.map((w) => w.date)).toEqual(['2027-01-05', '2027-01-07', '2027-01-10']);
    expect(result.schedule.workouts[0]!.steps.map((s) => s.target)).toEqual([300, 1000, 300].map((value) => ({ kind: 'duration_seconds', value })));
    const damaged = JSON.parse(JSON.stringify(result.schedule.workouts)); damaged[0].steps[1].target.value++;
    expect(validateFoundationWeek(damaged, evidence, constraints).valid).toBe(false);
  });
  it('responds numerically to current running evidence', () => { expect(generateFoundationWeek({ ...evidence, weeklyRunningMinutes: 45 }, constraints)).toMatchObject({ runningSeconds: 2700, totalSeconds: 4500 }); });
  it.each([
    [{ currentFactsConfirmed: false }, 'current_foundation_evidence_required'],
    [{ context: 'returning_after_break' }, 'returning_after_break_foundation_policy_required'],
    [{ context: 'first_time_runner' }, 'first_time_runner_foundation_policy_required'],
    [{ healthConcern: true }, 'health_review_required'],
    [{ continuousRunningMinutes: 10 }, 'session_exceeds_confirmed_continuous_capacity'],
  ])('preserves unsupported or health states %j', (change, reason) => { expect(generateFoundationWeek({ ...evidence, ...change } as FoundationCurrentEvidence, constraints)).toMatchObject({ kind: 'blocked', reasonCodes: [reason] }); });
  it('does not add days or bypass time limits', () => {
    expect(generateFoundationWeek(evidence, { ...constraints, availableDays: constraints.availableDays.slice(0, 2) })).toMatchObject({ kind: 'blocked' });
    expect(generateFoundationWeek(evidence, { ...constraints, availableDays: constraints.availableDays.map((day) => ({ ...day, maxMinutes: 26 })) })).toMatchObject({ kind: 'blocked' });
  });
});
