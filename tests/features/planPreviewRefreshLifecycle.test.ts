import { previewIdentityFor, planPreviewIdentityKey } from '@/application/planPreviewIdentity';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import {
  initialPlanFocusRefreshState,
  nextPlanFocusRefresh,
  retainEquivalentPreviewContext,
  shouldApplyPreviewRequest,
  shouldRequestPreviewForContext,
} from '@/features/execution/planPreviewRefreshLifecycle';

const context = (ownerId = 'account-a', changes: Record<string, unknown> = {}) => previewIdentityFor(ownerId, {
  ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Calcutta'),
  goal: 'half_marathon',
  goalFocus: 'finish',
  planStartDate: '2027-01-04',
  trainingDays: [1, 3, 6],
  minuteLimits: { 1: '60', 3: '60', 6: '90' },
  ...changes,
}, '2027-01-01T00:00:00.000Z', '2027-01-01');

describe('Plan preview refresh lifecycle', () => {
  it('retains an equivalent availability context and does not request the preview again', () => {
    const first = context();
    const equivalentNewObject = context();
    const retained = retainEquivalentPreviewContext(first, equivalentNewObject);

    expect(retained).toBe(first);
    expect(shouldRequestPreviewForContext(planPreviewIdentityKey(first), true, retained)).toBe(false);
  });

  it('loads once for an initial context and remains settled while it is unchanged', () => {
    const first = context();
    const key = planPreviewIdentityKey(first);

    expect(shouldRequestPreviewForContext(null, true, first)).toBe(true);
    expect(shouldRequestPreviewForContext(key, true, context())).toBe(false);
  });

  it.each([
    ['goal', context('account-a', { goal: '10k' })],
    ['assessment evidence', context('account-a', { weeklyMinutes: '120' })],
    ['scheduling evidence', context('account-a', { trainingDays: [0, 2, 5], minuteLimits: { 0: '60', 2: '60', 5: '90' } })],
    ['account', context('account-b')],
  ])('requests a fresh preview when %s changes', (_label, changed) => {
    expect(shouldRequestPreviewForContext(planPreviewIdentityKey(context()), true, changed)).toBe(true);
  });

  it('refreshes active-plan and availability data only on a subsequent focus transition', () => {
    const initialFocus = nextPlanFocusRefresh(initialPlanFocusRefreshState);
    const returnToPlan = nextPlanFocusRefresh(initialFocus.state);

    expect(initialFocus).toMatchObject({ refreshActivePlan: false, refreshAvailability: false });
    expect(returnToPlan).toMatchObject({ refreshActivePlan: true, refreshAvailability: true });
  });

  it('keeps research-disabled mode from starting a preview request', () => {
    expect(shouldRequestPreviewForContext(null, false, context())).toBe(false);
    expect(shouldRequestPreviewForContext(null, true, null)).toBe(false);
  });

  it('rejects a delayed result after a newer preview request has started', () => {
    expect(shouldApplyPreviewRequest(2, 1)).toBe(false);
    expect(shouldApplyPreviewRequest(2, 2)).toBe(true);
  });
});
