import { selectResearchPreview, type HalfPreviewSnapshot } from '@/features/execution/planResearchPreviewSelection';
import type { CurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';
import { generateFoundationProgram } from '@/domain/planning/foundationProgram';

const identity = 'owner-a:half_marathon:fingerprint:2026-11-20';
const unavailable = (codes: string[]): CurrentExperimentalHalfMarathonPreview => ({ kind: 'unavailable', reasonCodes: codes, researchOnly: true, productionEligible: false });
const state = (changes: Partial<HalfPreviewSnapshot> = {}): HalfPreviewSnapshot => ({ status: 'ready', data: unavailable(['assessment_outdated']), error: null, identity, source: 'half_marathon', ...changes });

describe('Plan research preview selection', () => {
  it('keeps a half-marathon null result in a safe loading state', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state({ status: 'loading', data: null, identity: null }))).toEqual({ kind: 'loading' });
  });

  it('keeps a failed half-marathon read out of the preview card', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state({ status: 'unavailable', data: null, error: 'offline' }))).toEqual({ kind: 'error', message: 'offline' });
  });

  it('renders applicable unavailable half-marathon results for their targeted explanation', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state())).toMatchObject({ kind: 'preview', value: { kind: 'unavailable', reasonCodes: ['assessment_outdated'] } });
  });

  it('does not render a retained candidate after a goal, account, or fingerprint identity change', () => {
    for (const current of ['owner-a:10k:fingerprint:2026-11-20', 'owner-b:half_marathon:fingerprint:2026-11-20', 'owner-a:half_marathon:new-fingerprint:2026-11-20']) {
      expect(selectResearchPreview(true, 'half_marathon', current, state())).toEqual({ kind: 'none' });
    }
  });

  it('does not show a non-applicable half-marathon result for 10K', () => {
    expect(selectResearchPreview(true, '10k', identity, state({ data: unavailable(['goal_not_half_marathon']) }))).toEqual({ kind: 'none' });
  });

  it('retains a matching foundation blocker and rejects an irrelevant half-marathon blocker', () => {
    const blocker = generateFoundationProgram({ context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: false, requestedFrequency: null, healthConcern: false, healthRelatedInterruption: false }, { ownerId: 'owner-a', goalFamily: '10k', startDate: '2027-01-04', fixedGoalDate: null, availableDays: [{ weekday: 1, maxMinutes: 45, confirmedByRunner: true }, { weekday: 3, maxMinutes: 45, confirmedByRunner: true }, { weekday: 6, maxMinutes: 45, confirmedByRunner: true }], unavailableDates: [], preferredLongRunDay: 6 });
    expect(blocker).toMatchObject({ kind: 'blocked', reasonCodes: ['foundation_frequency_required'] });
    expect(selectResearchPreview(true, '10k', identity, state({ data: blocker, source: 'foundation' }))).toMatchObject({ kind: 'preview', foundation: true, value: { kind: 'blocked', reasonCodes: ['foundation_frequency_required'] } });
    expect(selectResearchPreview(true, '10k', identity, state({ data: unavailable(['goal_not_half_marathon']) }))).toEqual({ kind: 'none' });
  });

  it.each(['10k', 'marathon'] as const)('renders an actual foundation programme for %s only when the foundation source is explicit', (goal) => {
    const program = generateFoundationProgram({ context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: false, requestedFrequency: 2, healthConcern: false, healthRelatedInterruption: false }, { ownerId: 'owner-a', goalFamily: goal, startDate: '2027-01-04', fixedGoalDate: null, availableDays: [{ weekday: 1, maxMinutes: 45, confirmedByRunner: true }, { weekday: 3, maxMinutes: 45, confirmedByRunner: true }], unavailableDates: [], preferredLongRunDay: 3 });
    expect(program.kind).toBe('foundation_program');
    expect(selectResearchPreview(true, goal, identity, state({ data: program, source: 'foundation' }))).toMatchObject({ kind: 'preview', foundation: true, value: { kind: 'foundation_program' } });
    expect(selectResearchPreview(true, goal, identity, state({ data: program, source: 'half_marathon' }))).toEqual({ kind: 'none' });
  });

  it('hides research content entirely when the build gate is off', () => {
    expect(selectResearchPreview(false, 'half_marathon', identity, state({ status: 'loading', data: null }))).toEqual({ kind: 'none' });
    expect(selectResearchPreview(false, 'half_marathon', identity, state())).toEqual({ kind: 'none' });
    expect(selectResearchPreview(false, '10k', identity, state({ data: generateFoundationProgram({ context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: false, requestedFrequency: null, healthConcern: false, healthRelatedInterruption: false }, { ownerId: 'owner-a', goalFamily: '10k', startDate: '2027-01-04', fixedGoalDate: null, availableDays: [], unavailableDates: [], preferredLongRunDay: null }), source: 'foundation' }))).toEqual({ kind: 'none' });
  });
});
