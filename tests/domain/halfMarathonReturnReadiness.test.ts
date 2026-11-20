import { assessHalfMarathonReturnReadiness, validateHalfMarathonReturnReadinessPolicy } from '@/domain/planning/halfMarathonReturnReadiness';

const history = { weeklyMinutes: 120, longestSessionMinutes: 60, comfortableRunMinutes: 45, weeklyObservationDate: '2026-01-01' as const, longestSessionDate: '2026-01-01' as const };
const input = (change = {}) => ({ currentTrainingStatus: 'currently_training' as const, lastRunningDate: '2026-01-01' as const, interruptionReason: 'schedule_or_travel' as const, interruption: 'none' as const, healthConcern: false, currentCapabilityConfirmedAt: '2026-11-06' as const, historical: history, ...change });

describe('half-marathon return-to-running evidence readiness', () => {
  it('keeps historical evidence but permits a current explicit confirmation to continue to authored preparation assessment', () => {
    const result = assessHalfMarathonReturnReadiness(input());
    expect(result).toMatchObject({ state: 'ready_for_supported_preparation', researchOnly: true, productionEligible: false, currentCapability: { eligibleForPreparationAssessment: true }, historicalCapability: history });
  });

  it.each([
    ['15-day', '2026-10-22'],
    ['40-day', '2026-09-27'],
    ['60-day', '2026-09-07'],
    ['100-day', '2026-07-29'],
  ])('returns a policy gap for a %s non-health return without discarding history', (_label, lastRunningDate) => {
    const result = assessHalfMarathonReturnReadiness(input({ currentTrainingStatus: 'returning_after_break', lastRunningDate }));
    expect(result).toMatchObject({ state: 'returning_after_break', reasonCodes: ['return_to_running_pathway_not_authored'], nextAction: 'return_to_running_policy_required', historicalCapability: history });
  });

  it('uses a health review state for illness, injury, and health concerns', () => {
    expect(assessHalfMarathonReturnReadiness(input({ currentTrainingStatus: 'returning_after_break', interruptionReason: 'illness_or_injury' }))).toMatchObject({ state: 'health_review_required', nextAction: 'health_review' });
    expect(assessHalfMarathonReturnReadiness(input({ healthConcern: true }))).toMatchObject({ state: 'health_review_required' });
  });

  it('does not manufacture a foundation or return prescription for first-time or unknown current context', () => {
    expect(assessHalfMarathonReturnReadiness(input({ currentTrainingStatus: 'first_time_runner', lastRunningDate: null }))).toMatchObject({ state: 'first_time_runner', reasonCodes: ['foundation_building_pathway_not_authored'] });
    expect(assessHalfMarathonReturnReadiness(input({ currentTrainingStatus: 'unknown', currentCapabilityConfirmedAt: null }))).toMatchObject({ state: 'insufficient_current_evidence', reasonCodes: ['current_training_context_unknown'] });
  });

  it('does not turn historical values into current evidence without explicit confirmation', () => {
    expect(assessHalfMarathonReturnReadiness(input({ currentCapabilityConfirmedAt: null }))).toMatchObject({ state: 'insufficient_current_evidence', reasonCodes: ['current_capacity_not_confirmed'], currentCapability: { eligibleForPreparationAssessment: false } });
  });

  it('keeps the policy draft-only and structurally complete', () => expect(validateHalfMarathonReturnReadinessPolicy()).toEqual([]));
});
