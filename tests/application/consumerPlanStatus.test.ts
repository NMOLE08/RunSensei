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

it('explains unavailable coaching authorization without claiming a human review is underway', () => {
  const status = consumerPlanStatus({ kind: 'policy_approval_pending', reasonCodes: ['release_trust_not_configured'] });
  expect(status).toMatchObject({ code: 'policy_approval_pending', title: 'Plan activation unavailable' });
  expect(status.message).toContain('coaching authorization is unavailable');
  expect(status.message).not.toContain('being reviewed');
});
