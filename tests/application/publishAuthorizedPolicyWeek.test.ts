import { publishAuthorizedPolicyWeek } from '@/application/publishAuthorizedPolicyWeek';
import { TrainingRepository } from '@/data/repositories';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { MemoryDatabase } from '../support/memoryDatabase';
import { syntheticHalfConstraints, syntheticHalfPolicy } from '../domain/multiDistancePolicy.test';

const now = '2027-01-01T00:00:00.000Z';
function request(ownerId = 'owner-a') { return { policyId: syntheticHalfPolicy.id, policyVersion: syntheticHalfPolicy.version, goalFamily: 'half_marathon' as const, weekNumber: 1, inputFingerprint: 'fingerprint-a', generationKey: 'owner-a-half-w1', constraints: { ...syntheticHalfConstraints, ownerId }, profile: { id: `profile:${ownerId}`, units: 'metric' as const, trainingTimezone: 'Asia/Calcutta', baselineJson: '{}', version: 1, createdAt: now, updatedAt: now }, goal: { id: `goal:${ownerId}`, profileId: `profile:${ownerId}`, mode: 'flexible' as const, distanceMeters: 21097.5, raceDate: null, startDate: '2027-01-04' as const, version: 1, createdAt: now }, availability: { id: `availability:${ownerId}`, profileId: `profile:${ownerId}`, weekdayLimitsJson: '{}', preferredLongRunDay: 6, exceptionsJson: '[]', version: 1, createdAt: now } }; }
const context = { now: () => now, id: (prefix: string) => `${prefix}:1`, allowTestPolicies: true };

describe('authorized policy week publication', () => {
  it('publishes an exact authorized test policy atomically and is idempotent', async () => {
    const database = new MemoryDatabase(); const repository = new TrainingRepository(database, 'owner-a'); const registry = new MultiDistancePolicyRegistry([syntheticHalfPolicy]);
    const first = await publishAuthorizedPolicyWeek(repository, registry, request(), context);
    expect(first.kind).toBe('published'); if (first.kind === 'published') expect(first.applied).toBe(true);
    const second = await publishAuthorizedPolicyWeek(repository, registry, request(), context);
    expect(second).toMatchObject({ kind: 'published', applied: false });
    expect(database.table('session_assignments')).toHaveLength(3);
    expect(database.table('plans')[0]?.owner_id).toBe('owner-a');
  });
  it('rejects a draft policy before a write', async () => {
    const database = new MemoryDatabase(); const result = await publishAuthorizedPolicyWeek(new TrainingRepository(database, 'owner-a'), new MultiDistancePolicyRegistry([{ ...syntheticHalfPolicy, releaseAuthorized: false, lifecycle: 'draft' }]), request(), context);
    expect(result).toEqual({ kind: 'blocked', reasonCodes: ['policy_not_authorized'] }); expect(database.table('plans')).toHaveLength(0);
  });
  it('does not expose a test policy to ordinary application context', async () => {
    const result = await publishAuthorizedPolicyWeek(new TrainingRepository(new MemoryDatabase(), 'owner-a'), new MultiDistancePolicyRegistry([syntheticHalfPolicy]), request(), { ...context, allowTestPolicies: false });
    expect(result).toEqual({ kind: 'blocked', reasonCodes: ['test_policy_not_available_to_application'] });
  });
  it('keeps a published plan invisible to a different account repository', async () => {
    const database = new MemoryDatabase(); const registry = new MultiDistancePolicyRegistry([syntheticHalfPolicy]);
    const result = await publishAuthorizedPolicyWeek(new TrainingRepository(database, 'owner-a'), registry, request('owner-a'), context);
    if (result.kind !== 'published') throw new Error('Expected publication');
    expect(await new TrainingRepository(database, 'owner-b').getPlanSnapshot(result.snapshot.plan.id)).toBeNull();
  });
  it('rolls the complete write back when a later insert fails', async () => {
    const database = new MemoryDatabase(); database.failOn = 'session_assignments';
    await expect(publishAuthorizedPolicyWeek(new TrainingRepository(database, 'owner-a'), new MultiDistancePolicyRegistry([syntheticHalfPolicy]), request(), context)).rejects.toThrow('Injected failure');
    expect(database.table('plans')).toHaveLength(0); expect(database.table('plan_revisions')).toHaveLength(0);
  });
});
