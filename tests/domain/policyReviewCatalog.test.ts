import { PolicyReviewCatalog, bundledPolicyReviewCatalog, bundledPolicyReviewPackages, releaseReadiness } from '@/domain/training/policyReviewCatalog';

describe('policy review catalog', () => {
  test('records every requested family but blocks release until qualified review', () => {
    expect(bundledPolicyReviewPackages.map((item) => item.family)).toEqual(expect.arrayContaining(['beginner_walk_run', 'first_5k', 'recreational_5k', 'first_10k', 'half_marathon_completion', 'marathon_completion']));
    for (const policy of bundledPolicyReviewPackages) {
      expect(releaseReadiness(policy)).toMatchObject({ ready: false });
      expect(releaseReadiness(policy).reasons).toContain('policy_not_reviewed');
    }
    expect(bundledPolicyReviewPackages.find((item) => item.id === 'beginner-to-5k-candidate')?.numericalRuleCandidates.every((rule) => rule.proposedFormula !== null)).toBe(true);
  });

  test('resolves exact historical versions and never substitutes a newer policy', () => {
    const policy = bundledPolicyReviewPackages[0];
    const catalog = new PolicyReviewCatalog([policy, { ...policy, version: '0.2.0-draft' }]);
    expect(catalog.resolveExact(policy.id, policy.version)).toMatchObject({ kind: 'found', policy: { version: '0.1.0-draft' } });
    expect(catalog.resolveExact(policy.id, '9.9.9')).toMatchObject({ kind: 'unavailable', code: 'policy_version_unavailable' });
  });

  test('offers only goal-relevant policy candidates for reviewer work', () => {
    expect(bundledPolicyReviewCatalog.forGoalDistance(5000).map((item) => item.family)).toEqual(['beginner_walk_run', 'first_5k', 'first_5k', 'recreational_5k']);
    expect(bundledPolicyReviewCatalog.forGoalDistance(42195).map((item) => item.family)).toEqual(['marathon_completion']);
    expect(bundledPolicyReviewCatalog.forGoalDistance(1609)).toEqual([]);
  });
});
