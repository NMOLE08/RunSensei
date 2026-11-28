import { consumerPlanStatus } from '@/application/consumerPlanStatus';
it('keeps research preview distinct from an authorized persisted plan', () => {
  expect(consumerPlanStatus({ kind: 'preview_available', reasonCodes: ['draft'] })).toMatchObject({ code: 'preview_available', activePlan: false });
  expect(consumerPlanStatus({ kind: 'authorized_persisted_plan', planId: 'saved-plan', policyReference: 'test@1', authorizationVerified: true })).toMatchObject({ code: 'plan_ready', activePlan: true });
  expect(() => consumerPlanStatus({ kind: 'authorized_persisted_plan', planId: '', policyReference: 'test@1', authorizationVerified: true })).toThrow();
});

it('keeps every blocked consumer state distinct and non-active', () => {
  const cases = ['more_information_needed', 'reassessment_required', 'schedule_conflict', 'health_review_required', 'program_not_supported', 'policy_approval_pending', 'production_authorization_failure', 'plan_persistence_failure'] as const;
  for (const kind of cases) {
    expect(consumerPlanStatus({ kind, reasonCodes: [kind] })).toMatchObject({ code: kind, activePlan: false });
  }
});

it('uses reason-specific recovery copy without changing the category or authorization', () => {
  const status = consumerPlanStatus({
    kind: 'reassessment_required',
    reasonCodes: ['outdated_running_history'],
    recovery: {
      field: 'longestSessionDate',
      destination: '/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan',
      title: 'Update your current running evidence',
      message: 'Your recent running evidence is outside the current freshness window.',
      actionLabel: 'Update running evidence',
    },
  });
  expect(status).toMatchObject({
    code: 'reassessment_required',
    activePlan: false,
    title: 'Update your current running evidence',
    message: 'Your recent running evidence is outside the current freshness window.',
    nextAction: { destination: '/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan' },
    recovery: { actionLabel: 'Update running evidence' },
  });
  expect(consumerPlanStatus({ kind: 'reassessment_required', reasonCodes: ['x'] })).toMatchObject({
    code: 'reassessment_required',
    title: 'Let’s update your running level',
  });
});

it('ignores recovery copy authored for another category', () => {
  const recovery = {
    field: 'healthConcern',
    destination: '/onboarding/running?part=running-interruption&focus=health-concern&returnTo=/plan',
    category: 'more_information_needed' as const,
    title: 'Add the information still needed',
    message: 'Add the missing runner information.',
    actionLabel: 'Add missing information',
  };
  const cases = ['reassessment_required', 'schedule_conflict', 'health_review_required', 'program_not_supported', 'policy_approval_pending', 'production_authorization_failure', 'plan_persistence_failure', 'publication_conflict'] as const;
  for (const kind of cases) {
    const baseline = consumerPlanStatus({ kind, reasonCodes: ['x'] });
    const status = consumerPlanStatus({ kind, reasonCodes: ['x'], recovery });
    expect(status).toMatchObject({ code: baseline.code, title: baseline.title, message: baseline.message, nextAction: baseline.nextAction });
    expect(status.recovery).toBeUndefined();
  }
});

it('explains unavailable coaching authorization without claiming a human review is underway', () => {
  const status = consumerPlanStatus({ kind: 'policy_approval_pending', reasonCodes: ['release_trust_not_configured'] });
  expect(status).toMatchObject({ code: 'policy_approval_pending', title: 'Plan activation unavailable' });
  expect(status.message).toContain('coaching authorization is unavailable');
  expect(status.message).not.toContain('being reviewed');
});
