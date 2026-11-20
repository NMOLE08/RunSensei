import type { Beginner5kPathway, Beginner5kPersonalizationPolicy, ImmutablePolicyReference } from './beginner5kPersonalizationPolicy';
import { bundledDraft5kProgramRegistry, type Draft5kProgramRegistry } from './draft5kProgramRegistry';

export type Beginner5kPolicyResolution =
  | { kind: 'found'; policy: Beginner5kPersonalizationPolicy }
  | { kind: 'unavailable'; code: 'personalization_policy_version_unavailable'; message: string };
export type Beginner5kPathwayResolution =
  | { kind: 'found'; policy: Beginner5kPersonalizationPolicy; pathway: Beginner5kPathway }
  | { kind: 'unavailable'; code: 'pathway_version_unavailable' | 'pathway_reference_mismatch' | 'policy_retired'; message: string };
export type Beginner5kActivationResolution =
  | { kind: 'authorized'; policy: Beginner5kPersonalizationPolicy; pathway: Beginner5kPathway }
  | { kind: 'unavailable'; code: 'policy_not_authorized' | 'pathway_version_unavailable' | 'pathway_reference_mismatch' | 'policy_retired'; message: string };

/** Exact-version registry. It never substitutes the newest policy for historical data. */
export class Beginner5kPersonalizationRegistry {
  constructor(private readonly policies: readonly Beginner5kPersonalizationPolicy[], private readonly programRegistry: Draft5kProgramRegistry = bundledDraft5kProgramRegistry) {
    const keys = policies.map((policy) => `${policy.policyId}@${policy.version}`);
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate beginner-5K personalization policy version.');
  }

  resolvePolicy(reference: ImmutablePolicyReference): Beginner5kPolicyResolution {
    const policy = this.policies.find((item) => item.policyId === reference.policyId && item.version === reference.version);
    return policy ? { kind: 'found', policy } : { kind: 'unavailable', code: 'personalization_policy_version_unavailable', message: 'This personalization policy version is unavailable. A newer policy will not be substituted.' };
  }

  resolvePathway(reference: ImmutablePolicyReference, pathwayId: string, pathwayVersion: string): Beginner5kPathwayResolution {
    const resolved = this.resolvePolicy(reference);
    if (resolved.kind === 'unavailable') return { kind: 'unavailable', code: 'pathway_version_unavailable', message: resolved.message };
    if (resolved.policy.lifecycle === 'retired') return { kind: 'unavailable', code: 'policy_retired', message: 'This policy is retired and cannot be selected for a new plan.' };
    const pathway = resolved.policy.pathways.find((item) => item.id === pathwayId && item.version === pathwayVersion);
    if (!pathway) return { kind: 'unavailable', code: 'pathway_version_unavailable', message: 'This pathway version is unavailable under the requested policy version.' };
    if (!this.programRegistry.resolve(pathway.workoutPolicyPack)) return { kind: 'unavailable', code: 'pathway_reference_mismatch', message: 'The pathway does not reference an exact immutable bundled workout policy-pack version.' };
    return { kind: 'found', policy: resolved.policy, pathway };
  }

  /** Production activation is stricter than draft preview selection. */
  authorizeActivation(reference: ImmutablePolicyReference, pathwayId: string, pathwayVersion: string): Beginner5kActivationResolution {
    const resolved = this.resolvePathway(reference, pathwayId, pathwayVersion);
    if (resolved.kind === 'unavailable') return resolved;
    if (resolved.policy.lifecycle !== 'reviewed' || resolved.policy.releaseEligibility !== 'eligible_after_release_review') {
      return { kind: 'unavailable', code: 'policy_not_authorized', message: 'This personalization policy is not authorized for production activation.' };
    }
    return { kind: 'authorized', policy: resolved.policy, pathway: resolved.pathway };
  }
}

