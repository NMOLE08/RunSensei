import { resolveExperimentalPreviewResponse } from '@/features/execution/useExperimentalHalfMarathonPreview';
import { previewIdentityFor } from '@/application/planPreviewIdentity';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import type { CurrentExperimentalHalfMarathonPreviewResponse } from '@/application/experimentalHalfMarathonPreview';

const context = (ownerId: string, changes: Record<string, unknown> = {}) => {
  const draft = { ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Calcutta'), goal: 'half_marathon' as const, goalFocus: 'finish' as const, planStartDate: '2027-01-04', trainingDays: [1, 3, 6], minuteLimits: { 1: '60', 3: '60', 6: '90' }, ...changes };
  return previewIdentityFor(ownerId, draft, '2027-01-01T00:00:00.000Z', '2027-01-01');
};
const response = (previewContext: ReturnType<typeof context>): CurrentExperimentalHalfMarathonPreviewResponse => ({ previewContext, source: 'half_marathon', value: { kind: 'unavailable', reasonCodes: ['assessment_outdated'], researchOnly: true, productionEligible: false } });

describe('experimental half-marathon preview provenance boundary', () => {
  it('accepts only a response generated from the requested runner context', () => {
    const requested = context('account-a');
    expect(resolveExperimentalPreviewResponse(requested, response(requested))).toMatchObject({ status: 'ready', data: { kind: 'unavailable' }, source: 'half_marathon' });
  });

  it.each([
    ['different assessment evidence', context('account-a', { weeklyMinutes: '120' })],
    ['different goal', context('account-a', { goal: '10k' })],
    ['different availability', context('account-a', { trainingDays: [0, 2, 5], minuteLimits: { 0: '60', 2: '60', 5: '90' } })],
    ['different account', context('account-b')],
  ])('rejects a response generated from %s', (_label, generated) => {
    expect(resolveExperimentalPreviewResponse(context('account-a'), response(generated))).toMatchObject({ status: 'unavailable', data: null, error: expect.stringContaining('changed'), source: null });
  });

  it('retains a foundation blocker only when its provenance matches', () => {
    const requested = context('account-a', { goal: '10k', foundationEvidenceConfirmedAt: '2027-01-01' });
    const foundation: CurrentExperimentalHalfMarathonPreviewResponse = { previewContext: requested, source: 'foundation', value: { kind: 'blocked', reasonCodes: ['foundation_frequency_required'], researchOnly: true, productionEligible: false, policyReference: 'runsensei.foundation.multiweek@0.3.0-draft' } };
    expect(resolveExperimentalPreviewResponse(requested, foundation)).toMatchObject({ status: 'ready', source: 'foundation', data: { kind: 'blocked' } });
  });
});
