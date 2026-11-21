import { assessFitness } from '@/domain/assessment/assessFitness';
import { evaluatePlanAvailability } from '@/domain/assessment/planAvailability';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { consumerStatusForPlanAvailability, presentPlanAvailability } from '@/features/execution/planAvailabilityPresentation';

const draft = (overrides = {}) => ({ ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-11-01', comfortableRunMinutes: '25', interruption: 'none' as const, adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'substantial' as const, planStartDate: '2026-11-10', trainingDays: [1, 3, 6], minuteLimits: { 1: '60', 3: '60', 6: '60' }, ...overrides });
const availability = (value: ReturnType<typeof draft>) => evaluatePlanAvailability({ draft: value, assessment: assessFitness(value, '2026-11-03T00:00:00.000Z'), activeSnapshot: null });

describe('Plan availability explanations', () => {
  it('uses the authenticated publication status and its exact field recovery', () => {
    const publicationStatus = { code: 'more_information_needed' as const, title: 'Missing answer', message: 'Add your answer', nextAction: { destination: '/onboarding/running?part=first5-check' }, diagnostics: { reasonCodes: ['missing_adult_age_confirmed'] }, activePlan: false, recovery: { field: 'adultAgeConfirmed', destination: '/onboarding/running?part=first5-check' } };
    expect(consumerStatusForPlanAvailability({ ...availability(draft()), consumerStatus: publicationStatus })).toBe(publicationStatus);
  });
  it('maps structured availability into a consumer status without treating draft content as an active plan', () => {
    const status = consumerStatusForPlanAvailability(availability(draft()));
    expect(status).toMatchObject({ code: 'policy_approval_pending', activePlan: false });
    expect(status.diagnostics.reasonCodes).toContain('draft_policy_not_release_ready');
  });

  it('preserves a verified persisted plan as the only active-plan state', () => {
    const active = { id: 'plan-a', mode: 'real' as const, recommendationState: 'active' as const, activeRevisionId: 'revision-a', goalId: 'goal-a', templateId: 'template-a', validationFingerprint: 'fingerprint', createdAt: '2026-01-01T00:00:00.000Z' };
    const revision = { id: 'revision-a', planId: 'plan-a', parentRevisionId: null, engineVersion: 'engine', templateVersion: 'policy', ruleVersion: '1.0.0', inputFingerprint: 'fingerprint', explanationJson: '{}', createdAt: '2026-01-01T00:00:00.000Z' };
    const result = evaluatePlanAvailability({ draft: draft(), assessment: assessFitness(draft(), '2026-11-03T00:00:00.000Z'), activeSnapshot: { plan: active, revision, assignments: [] } });
    expect(consumerStatusForPlanAvailability(result)).toMatchObject({ code: 'plan_ready', activePlan: true });
  });
  it('explains a long interruption and opens the focused interruption question', () => {
    const view = presentPlanAvailability(availability(draft({ interruption: 'over_four_weeks' as const })));
    expect(view).toMatchObject({ title: 'Update your running baseline', actionPath: expect.stringContaining('focus=recent-interruption') });
  });

  it('explains the existing base-running hold without changing its decision', () => {
    const value = draft({ comfortableRunMinutes: '15' });
    expect(availability(value).reasons).toEqual(['assessment_needs_reassessment']);
    expect(presentPlanAvailability(availability(value)).title).toBe('Build your running foundation');
  });

  it('directs missing information to the existing focused onboarding field', () => {
    const view = presentPlanAvailability(availability(draft({ interruption: 'unknown' as const })));
    expect(view).toMatchObject({ title: 'Add the information still needed', actionPath: expect.stringContaining('focus=recent-interruption') });
  });

  it('keeps health and unsupported schedule holds distinct', () => {
    expect(presentPlanAvailability(availability(draft({ healthConcern: true }))).title).toBe('Health review required');
    expect(presentPlanAvailability(availability(draft({ trainingDays: [4, 6], minuteLimits: { 4: '60', 6: '60' } }))).title).toBe('Adjust your training availability');
  });

  it('identifies marathon as an un-authored programme family without treating it as missing runner information', () => {
    const marathon = availability(draft({ goal: 'marathon' }));
    expect(marathon.reasons).toContain('marathon_event_programme_not_authored');
    expect(consumerStatusForPlanAvailability(marathon)).toMatchObject({ code: 'program_not_supported', activePlan: false });
    expect(presentPlanAvailability(marathon)).toMatchObject({
      title: 'Marathon event plan is not authored',
      actionLabel: null,
      actionPath: null,
    });
  });
});
