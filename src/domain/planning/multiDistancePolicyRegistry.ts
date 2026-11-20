import type { GoalFamily, MultiDistanceTrainingPolicy } from './multiDistancePolicy';

export type PolicyResolution = { kind: 'found'; policy: MultiDistanceTrainingPolicy } | { kind: 'unavailable'; code: 'policy_version_unavailable' | 'policy_goal_mismatch' | 'policy_not_authorized'; message: string };

/** Exact-version lookup. It never substitutes a newer policy for a saved plan. */
export class MultiDistancePolicyRegistry {
  public constructor(private readonly policies: readonly MultiDistanceTrainingPolicy[]) {
    const keys = policies.map((policy) => `${policy.id}@${policy.version}`);
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate multi-distance policy version.');
  }
  resolve(id: string, version: string, goal: GoalFamily, requireAuthorization = false): PolicyResolution {
    const policy = this.policies.find((item) => item.id === id && item.version === version);
    if (!policy) return { kind: 'unavailable', code: 'policy_version_unavailable', message: 'That exact training policy version is not available.' };
    if (policy.goalFamily !== goal) return { kind: 'unavailable', code: 'policy_goal_mismatch', message: 'That policy does not support the requested goal.' };
    if (requireAuthorization && !policy.releaseAuthorized) return { kind: 'unavailable', code: 'policy_not_authorized', message: 'This policy is not authorized for production publication.' };
    return { kind: 'found', policy };
  }
  list(goal: GoalFamily) { return this.policies.filter((policy) => policy.goalFamily === goal); }
}

/** Shipped catalog intentionally contains no release-authorized 10K, half, or marathon policy. */
export const bundledMultiDistancePolicyRegistry = new MultiDistancePolicyRegistry([]);
