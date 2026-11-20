import { schedulePolicyWeek, validateMultiDistancePolicy, type MultiDistanceTrainingPolicy } from '@/domain/planning/multiDistancePolicy';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { nyrrReferenceCatalog, validateNyrrReferenceCatalog } from '@/domain/planning/nyrrReferenceCatalog';

const policy: MultiDistanceTrainingPolicy = {
  id: 'test.half.synthetic', version: '1.0.0-test', goalFamily: 'half_marathon', lifecycle: 'release_ready', releaseAuthorized: true, testOnly: true,
  supportedFrequency: [3], minimumRecoveryDays: 1, sourceReferences: ['synthetic:test-only'], requiredEvidence: ['recent_running_history'], missingCapabilities: [],
  weeks: [{ week: 1, phase: 'base', recoveryWeek: false, taper: false, workouts: ['A', 'B', 'C'].map((slot, index) => ({ slot, role: index === 2 ? 'long' : 'easy', phase: 'base', purpose: 'Synthetic verification only', target: { kind: 'duration_seconds', value: index === 2 ? 3600 : 1800 }, protected: index === 2, steps: [{ kind: 'warmup', instruction: 'Warm up', purpose: 'prepare', effort: 'easy', target: { kind: 'duration_seconds', value: 300 }, repeats: 1 }, { kind: 'work', instruction: 'Main', purpose: 'synthetic', effort: 'easy', target: { kind: 'duration_seconds', value: index === 2 ? 3000 : 1200 }, repeats: 1 }, { kind: 'cooldown', instruction: 'Cool down', purpose: 'recover', effort: 'easy', target: { kind: 'duration_seconds', value: 300 }, repeats: 1 } ] })) }],
};
const constraints = { ownerId: 'owner-a', goalFamily: 'half_marathon' as const, startDate: '2027-01-04' as const, fixedGoalDate: null, unavailableDates: [], preferredLongRunDay: 6, availableDays: [{ weekday: 1, maxMinutes: 40, confirmedByRunner: true }, { weekday: 3, maxMinutes: 40, confirmedByRunner: true }, { weekday: 6, maxMinutes: 70, confirmedByRunner: true }] };

describe('multi-distance policy engine', () => {
  it('requires explicit successor semantics before ignoring personal time answers', () => {
    const unknown = { ...constraints, availableDays: constraints.availableDays.map(day => ({ ...day, maxMinutes: null, confirmedByRunner: false })) };
    expect(schedulePolicyWeek(policy, unknown, 1).kind).toBe('blocked');
    const successor = { ...policy, version: '2.0.0-test', availabilityTimeRequirement: 'not_collected' as const };
    const result = schedulePolicyWeek(successor, unknown, 1);
    expect(result.kind).toBe('scheduled');
    if (result.kind === 'scheduled') {
      expect(result.warnings).toContain('personal_time_availability_not_assessed');
      expect(result.workouts.map(workout => workout.steps)).toEqual(policy.weeks[0]!.workouts.map(workout => workout.steps));
      expect(result.workouts.every(workout => workout.policyReferences[0] === 'test.half.synthetic@2.0.0-test')).toBe(true);
    }
    expect(unknown.availableDays.every(day => day.maxMinutes === null)).toBe(true);
    expect(schedulePolicyWeek({ ...successor, lifecycle: 'draft', releaseAuthorized: false }, unknown, 1).kind).toBe('blocked');
  });
  it('keeps the supplied NYRR inventory research-only and complete', () => {
    expect(validateNyrrReferenceCatalog().valid).toBe(true);
    expect(nyrrReferenceCatalog).toHaveLength(9);
    expect(nyrrReferenceCatalog.every((item) => item.releaseEligible === false)).toBe(true);
  });
  it('schedules an exact authorized synthetic policy without changing authored steps', () => {
    const result = schedulePolicyWeek(policy, constraints, 1);
    expect(result.kind).toBe('scheduled');
    if (result.kind === 'scheduled') { expect(result.workouts.map((item) => item.date)).toEqual(['2027-01-05', '2027-01-07', '2027-01-10']); expect(result.workouts[2]?.steps[1]?.target).toEqual({ kind: 'duration_seconds', value: 3000 }); }
  });
  it('reports exact time-limit conflicts instead of shortening a workout', () => {
    const result = schedulePolicyWeek(policy, { ...constraints, availableDays: constraints.availableDays.map((item) => item.weekday === 6 ? { ...item, maxMinutes: 45 } : item) }, 1);
    expect(result.kind).toBe('blocked');
    if (result.kind === 'blocked') expect(result.conflicts.some((item) => item.code === 'session_exceeds_time_limit' && item.requiredMinutes === 60 && item.availableMinutes === 45)).toBe(true);
  });
  it('has exact immutable registry resolution and rejects a goal mismatch', () => {
    const registry = new MultiDistancePolicyRegistry([policy]);
    expect(registry.resolve(policy.id, policy.version, 'half_marathon', true).kind).toBe('found');
    expect(registry.resolve(policy.id, 'missing', 'half_marathon').kind).toBe('unavailable');
    expect(registry.resolve(policy.id, policy.version, '10k').kind).toBe('unavailable');
  });
  it('does not treat malformed policy math as valid', () => {
    expect(validateMultiDistancePolicy({ ...policy, weeks: [{ ...policy.weeks[0]!, workouts: [{ ...policy.weeks[0]!.workouts[0]!, target: { kind: 'duration_seconds', value: 1 } }] }] }).some((item) => item.includes('mismatch'))).toBe(true);
  });
});
export { policy as syntheticHalfPolicy, constraints as syntheticHalfConstraints };
