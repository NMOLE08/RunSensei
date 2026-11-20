import { generateFoundationProgram, validateFoundationProgram, type FoundationProgramEvidence } from '@/domain/planning/foundationProgram';
import type { MultiDistanceRunnerConstraints } from '@/domain/planning/multiDistancePolicy';
const evidence: FoundationProgramEvidence = { context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: false, healthConcern: false, healthRelatedInterruption: false, requestedFrequency: 3 };
const constraints: MultiDistanceRunnerConstraints = { ownerId: 'synthetic', goalFamily: 'half_marathon', startDate: '2027-01-04', fixedGoalDate: null, availableDays: [1,3,6].map(weekday => ({ weekday, maxMinutes: 45, confirmedByRunner: true })), unavailableDates: [], preferredLongRunDay: null };
it('builds four explicit conditional stages and protects the recovery stage', () => {
  const result = generateFoundationProgram(evidence, constraints);
  expect(result.kind).toBe('foundation_program');
  if (result.kind !== 'foundation_program') throw new Error('Missing program');
  expect(result.workouts).toHaveLength(12);
  expect(result.workouts.filter(w => w.week === 1).map(w => w.target)).toEqual(Array(3).fill({ kind: 'duration_seconds', value: 1600 }));
  expect(result.weeks[3].recoveryWeek).toBe(true);
  expect(result.productionEligible).toBe(false);
  expect(result.transition.automaticTransitionAuthorized).toBe(false);
  expect(validateFoundationProgram(result.workouts.slice(1), evidence, constraints).valid).toBe(false);
});
it('distinguishes a missing runner choice from an unsupported policy frequency', () => {
  expect(generateFoundationProgram({ ...evidence, requestedFrequency: null }, constraints)).toMatchObject({ kind: 'blocked', reasonCodes: ['foundation_frequency_required'] });
  expect(generateFoundationProgram({ ...evidence, requestedFrequency: 4 }, constraints)).toMatchObject({ kind: 'blocked', reasonCodes: ['foundation_frequency_policy_gap'] });
});
it('preserves Thursday and Saturday two-day availability', () => {
  const result = generateFoundationProgram({ ...evidence, requestedFrequency: 2 }, { ...constraints, availableDays: [3,5].map(weekday => ({weekday, maxMinutes: 45, confirmedByRunner: true})) });
  expect(result.kind).toBe('foundation_program');
  if (result.kind === 'foundation_program') expect(result.workouts.map(w => w.date).slice(0,2)).toEqual(['2027-01-07','2027-01-09']);
});
it.each(['first_time_runner', 'returning_after_break'] as const)('uses demonstrated short intervals for %s', context => {
  const result = generateFoundationProgram({ ...evidence, context, currentWeeklyRunningSeconds: 300, currentContinuousRunningSeconds: 30, demonstratedAfterBreak: true }, constraints);
  expect(result.kind).toBe('foundation_program');
  if (result.kind === 'foundation_program') expect(result.workouts[0].steps.some(s => s.kind === 'recovery')).toBe(true);
});
it('blocks missing post-break evidence and health concerns', () => {
  expect(generateFoundationProgram({ ...evidence, context: 'returning_after_break' }, constraints)).toMatchObject({ reasonCodes: ['post_break_current_evidence_required'] });
  expect(generateFoundationProgram({ ...evidence, healthConcern: true }, constraints)).toMatchObject({ reasonCodes: ['health_review_required'] });
});

it('finds a complete alternative schedule when the first weekly choice breaks cross-week recovery', () => {
  const result = generateFoundationProgram({ ...evidence, requestedFrequency: 2 }, { ...constraints, availableDays: [0,2,4,6].map(weekday => ({weekday, maxMinutes:45, confirmedByRunner:true})), unavailableDates:['2027-01-11','2027-01-13'] });
  expect(result.kind).toBe('foundation_program');
  if (result.kind === 'foundation_program') expect(result.validation.valid).toBe(true);
});

it('rejects altered steps, dates and references independently', () => {
  const result = generateFoundationProgram(evidence, constraints);
  if (result.kind !== 'foundation_program') throw new Error('Expected program');
  const changed = result.workouts.map((w,i) => i ? w : { ...w, steps: [], policyReferences:['wrong@version'], date:'2027-01-06' as const });
  expect(validateFoundationProgram(changed, evidence, constraints)).toMatchObject({valid:false, issues:expect.arrayContaining(['invalid_structure','policy_reference','arithmetic'])});
});
