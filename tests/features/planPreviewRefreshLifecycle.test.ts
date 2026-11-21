import { previewIdentityFor, planPreviewIdentityKey } from '@/application/planPreviewIdentity';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import {
  initialPlanFocusRefreshState,
  nextPlanFocusRefresh,
  saveSelectedPreviewWeek,
  selectedPreviewWeek,
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
  it('does not request a preview again for an equivalent newly allocated context', () => {
    const first = context();
    const equivalentNewObject = context();

    expect(shouldRequestPreviewForContext(planPreviewIdentityKey(first), true, equivalentNewObject)).toBe(false);
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

  it('requests a fresh preview when a committed pathway choice or revision changes', () => {
    const legacy = context();
    const event = previewIdentityFor('account-a', { ...emptyFitnessAssessmentDraft('account-a', 'Asia/Calcutta'), goal: 'half_marathon', goalFocus: 'finish', planStartDate: '2027-01-04', trainingDays: [1, 3, 6], minuteLimits: { 1: '60', 3: '60', 6: '90' } }, '2027-01-01T00:00:00.000Z', '2027-01-01', { ownerId: 'account-a', goal: 'half_marathon', choice: 'event_preparation', schemaVersion: 1, revision: 1, updatedAt: 'now' });
    const newerEvent = { ...event, pathwayRevision: 2 };
    expect(shouldRequestPreviewForContext(planPreviewIdentityKey(legacy), true, event)).toBe(true);
    expect(shouldRequestPreviewForContext(planPreviewIdentityKey(event), true, newerEvent)).toBe(true);
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

  it('preserves a selected week for an equivalent preview identity after remount', () => {
    const identity = planPreviewIdentityKey(context());
    const selected = saveSelectedPreviewWeek({}, identity, 3, 12);

    expect(selectedPreviewWeek(selected, identity, 12)).toBe(3);
  });

  it('starts a different preview identity at week one and clamps invalid saved weeks', () => {
    const firstIdentity = planPreviewIdentityKey(context());
    const changedIdentity = planPreviewIdentityKey(context('account-a', { goal: '10k' }));
    const selected = saveSelectedPreviewWeek({}, firstIdentity, 12, 12);

    expect(selectedPreviewWeek(selected, changedIdentity, 10)).toBe(1);
    expect(selectedPreviewWeek(selected, firstIdentity, 10)).toBe(10);
  });

  it('bounds screen-local selections while retaining the newest programme week', () => {
    let selected: Record<string, number> = {};
    for (let index = 0; index < 14; index += 1) selected = saveSelectedPreviewWeek(selected, `programme-${index}`, 3, 12);
    expect(Object.keys(selected)).toHaveLength(12);
    expect(selectedPreviewWeek(selected, 'programme-13', 12)).toBe(3);
    expect(selectedPreviewWeek(selected, 'programme-0', 12)).toBe(1);
  });
});
