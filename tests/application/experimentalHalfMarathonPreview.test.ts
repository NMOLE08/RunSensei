import { openCurrentExperimentalHalfMarathonPreview, openCurrentExperimentalHalfMarathonPreviewWithProvenance } from '@/application/experimentalHalfMarathonPreview';
import { previewIdentityFor } from '@/application/planPreviewIdentity';
import { loadCurrentAccountPlanFacts } from '@/application/planAvailability';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { assessFitness } from '@/domain/assessment/assessFitness';

jest.mock('@/application/planAvailability', () => ({ loadCurrentAccountPlanFacts: jest.fn() }));

const mockedFacts = loadCurrentAccountPlanFacts as jest.MockedFunction<typeof loadCurrentAccountPlanFacts>;
function facts(ownerId: string, overrides = {}) { const draft = { ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Calcutta'), goal: 'half_marathon' as const, goalFocus: 'finish' as const, planStartDate: '2027-01-04', trainingDays: [1, 3, 6], minuteLimits: { 1: '75', 3: '75', 6: '100' }, minuteLimitConfirmedDays: [1, 3, 6], interruption: 'none' as const, weeklyMinutes: '110', weeklyEvidenceConfirmedAt: '2026-12-30', currentCapabilityConfirmedAt: '2026-12-30', currentTrainingStatus: 'currently_training' as const, lastRunningDate: '2026-12-30', interruptionReason: 'schedule_or_travel' as const, longestSessionMinutes: '45', longestSessionDate: '2026-12-30', comfortableRunMinutes: '40', ...overrides }; return { ownerId, draft, assessment: assessFitness(draft, '2027-01-01T00:00:00.000Z'), activeSnapshot: null }; }

describe('experimental half-marathon preview application adapter', () => {
  it('returns provenance from the exact facts used for an applicable result', async () => {
    const value = facts('account-provenance');
    mockedFacts.mockResolvedValue(value);
    const result = await openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01');
    expect(result.previewContext).toEqual(previewIdentityFor(value.ownerId, value.draft, expect.any(String), '2027-01-01'));
    expect(result).toMatchObject({ source: 'half_marathon', value: { kind: 'simulation' } });
  });
  it('preserves foundation-blocker provenance from the actual loaded 10K facts', async () => {
    const value = facts('account-foundation', { goal: '10k', foundationEvidenceConfirmedAt: '2027-01-01', foundationFrequency: null });
    value.assessment = assessFitness(value.draft, '2027-01-01T00:00:00.000Z');
    mockedFacts.mockResolvedValue(value);
    await expect(openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01')).resolves.toMatchObject({ source: 'foundation', previewContext: { ownerId: 'account-foundation', goal: '10k' }, value: { kind: 'blocked', reasonCodes: ['foundation_frequency_required'] } });
  });
  it('routes confirmed current running to a validated foundation preview without using historical longest capacity', async () => {
    const value = facts('foundation-account', { weeklyMinutes: '50', comfortableRunMinutes: '45', longestSessionMinutes: '75', longestSessionDate: '2025-01-01', currentCapabilityConfirmedAt: '', foundationEvidenceConfirmedAt: '2027-01-01', trainingDays: [0, 1, 3, 6], minuteLimits: { 0: '30', 1: '30', 3: '30', 6: '30' }, minuteLimitConfirmedDays: [0, 1, 3, 6] });
    mockedFacts.mockResolvedValue(value);
    value.draft.foundationFrequency = 3;
    value.assessment = assessFitness(value.draft);
    const result = await openCurrentExperimentalHalfMarathonPreview();
    expect(result).toMatchObject({ kind: 'foundation_program', validation: { valid: true }, researchOnly: true, productionEligible: false });
    if (result.kind === 'foundation_program') {
      expect(result.weeks).toHaveLength(4);
      expect(result.workouts).toHaveLength(12);
      expect(result.workouts.filter((workout) => workout.week === 1).map((workout) => workout.date)).toEqual(['2027-01-05', '2027-01-07', '2027-01-10']);
      expect(result.workouts.filter((workout) => workout.week === 1).map((workout) => workout.target)).toEqual(Array(3).fill({ kind: 'duration_seconds', value: 1600 }));
    }
    expect(value.draft.longestSessionMinutes).toBe('75');
    expect(value.draft.goal).toBe('half_marathon');
  });
  it('uses explicit event preparation instead of historical foundation confirmation', async () => {
    const value = facts('event-choice', { foundationEvidenceConfirmedAt: '2027-01-01' });
    value.pathwayIntent = { ownerId: 'event-choice', goal: 'half_marathon', choice: 'event_preparation', schemaVersion: 1, revision: 2, updatedAt: '2027-01-01T00:00:00.000Z' };
    mockedFacts.mockResolvedValue(value);
    const result = await openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01');
    expect(result).toMatchObject({ source: 'half_marathon', previewContext: { pathwayChoice: 'event_preparation', pathwayRevision: 2 }, value: { kind: 'simulation', policy: { version: '0.3.0-calendar-draft' } } });
    expect(value.draft.foundationEvidenceConfirmedAt).toBe('2027-01-01');
  });
  it('uses explicit foundation even where the historical confirmation is absent', async () => {
    const value = facts('foundation-choice', { foundationEvidenceConfirmedAt: '' });
    value.pathwayIntent = { ownerId: 'foundation-choice', goal: 'half_marathon', choice: 'foundation', schemaVersion: 1, revision: 1, updatedAt: '2027-01-01T00:00:00.000Z' };
    mockedFacts.mockResolvedValue(value);
    await expect(openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01')).resolves.toMatchObject({ source: 'foundation', value: { kind: 'blocked', reasonCodes: ['current_foundation_evidence_required'] } });
  });
  it('uses actual saved foundation confirmation for an explicit foundation request', async () => {
    const value = facts('foundation-confirmed', { foundationEvidenceConfirmedAt: '2027-01-01', foundationFrequency: 3 });
    value.pathwayIntent = { ownerId: 'foundation-confirmed', goal: 'half_marathon', choice: 'foundation', schemaVersion: 1, revision: 1, updatedAt: '2027-01-01T00:00:00.000Z' };
    mockedFacts.mockResolvedValue(value);
    await expect(openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01')).resolves.toMatchObject({ source: 'foundation', value: { kind: 'foundation_program', researchOnly: true, productionEligible: false } });
    expect(value.draft.foundationEvidenceConfirmedAt).toBe('2027-01-01');
  });
  afterEach(() => jest.resetAllMocks());
  it('takes an eligible persisted assessment through readiness, policy selection, scheduling, validation, and a complete ten-week preview without persistence', async () => {
    mockedFacts.mockResolvedValue(facts('account-a'));
    const result = await openCurrentExperimentalHalfMarathonPreview();
    expect(result).toMatchObject({ kind: 'simulation', researchOnly: true, productionEligible: false });
    if (result.kind === 'simulation') {
      expect(result.policy.version).toBe('0.3.0-calendar-draft');
      expect(result.weeks).toHaveLength(10);
      expect(result.weeks.flatMap((week) => week.workouts)).toHaveLength(30);
      expect(result.validation).toEqual({ valid: true, issues: [] });
      expect(result.diagnostics.readiness).toMatchObject({ state: 'ready_for_supported_preparation' });
    }
    expect(mockedFacts).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('activeRevisionId');
  });
  it.each(['improve_performance', 'unknown'] as const)('does not misrepresent the completion-only schedule as a %s objective plan', async (trainingObjective) => {
    const value = facts(`objective-${trainingObjective}`, { trainingObjective });
    mockedFacts.mockResolvedValue(value);
    await expect(openCurrentExperimentalHalfMarathonPreviewWithProvenance('2027-01-01')).resolves.toMatchObject({
      source: 'half_marathon',
      value: { kind: 'unavailable', reasonCodes: ['half_marathon_objective_not_authored'], researchOnly: true, productionEligible: false },
    });
  });
  it('uses the calendar-only successor when daily time limits were not collected', async () => {
    mockedFacts.mockResolvedValue(facts('account-calendar-only', { minuteLimits: {}, minuteLimitConfirmedDays: [] }));
    const result = await openCurrentExperimentalHalfMarathonPreview();
    expect(result).toMatchObject({ kind: 'simulation', policy: { version: '0.3.0-calendar-draft' }, researchOnly: true, productionEligible: false });
    if (result.kind === 'simulation') {
      expect(result.weeks.flatMap((week) => week.workouts)).toHaveLength(30);
      expect(result.weeks.every((week) => week.warnings?.includes('personal_time_availability_not_assessed') === true)).toBe(true);
    }
  });
  it('does not treat a record timestamp-only change as changed runner evidence', async () => {
    const value = facts('account-a');
    value.draft.updatedAt = '2027-01-02T10:00:00.000Z';
    mockedFacts.mockResolvedValue(value);
    await expect(openCurrentExperimentalHalfMarathonPreview()).resolves.toMatchObject({ kind: 'simulation' });
  });
  it('returns explicit incompatibility without changing saved facts', async () => { const value = facts('account-b', { trainingDays: [1, 3] }); mockedFacts.mockResolvedValue(value); const result = await openCurrentExperimentalHalfMarathonPreview(); expect(result).toMatchObject({ kind: 'blocked', reasonCodes: ['two_day_half_marathon_policy_not_authored'] }); expect(value.draft.trainingDays).toEqual([1, 3]); });
  it('shows exact missing evidence instead of collapsing an insufficient assessment', async () => { const value = facts('account-b', { weeklyMinutes: '', longestSessionMinutes: '', comfortableRunMinutes: '' }); value.assessment = assessFitness(value.draft, '2027-01-01T00:00:00.000Z'); mockedFacts.mockResolvedValue(value); await expect(openCurrentExperimentalHalfMarathonPreview()).resolves.toMatchObject({ kind: 'unavailable', reasonCodes: ['assessment_insufficient_information'], missingEvidence: expect.arrayContaining(['recent weekly running', 'recent longest session', 'comfortable continuous running duration']) }); });
  it('requires a fresh review after saved answers change', async () => { const value = facts('account-b'); value.draft.weeklyMinutes = '140'; mockedFacts.mockResolvedValue(value); await expect(openCurrentExperimentalHalfMarathonPreview()).resolves.toMatchObject({ kind: 'unavailable', reasonCodes: ['assessment_outdated'] }); });
  it('does not run for a different saved goal', async () => { mockedFacts.mockResolvedValue(facts('account-c', { goal: '10k' })); expect(await openCurrentExperimentalHalfMarathonPreview()).toMatchObject({ kind: 'unavailable', reasonCodes: ['goal_not_half_marathon'] }); });
  it('uses explicitly confirmed current capacity instead of rejecting older historical dates', async () => { mockedFacts.mockResolvedValue(facts('account-d', { weeklyEvidenceConfirmedAt: '2027-01-01', currentCapabilityConfirmedAt: '2027-01-01', longestSessionDate: '2026-10-01' })); const result = await openCurrentExperimentalHalfMarathonPreview(); expect(result).toMatchObject({ kind: 'simulation', researchOnly: true, productionEligible: false }); if (result.kind === 'simulation') expect(result.diagnostics.readiness).toMatchObject({ state: 'ready_for_supported_preparation' }); });
  it('returns a source-aware return-to-running policy gap rather than stale evidence', async () => { const value = facts('account-e', { currentTrainingStatus: 'returning_after_break', lastRunningDate: '2026-08-01', interruption: 'over_four_weeks' as const }); value.assessment = assessFitness(value.draft, '2027-01-01T00:00:00.000Z'); mockedFacts.mockResolvedValue(value); await expect(openCurrentExperimentalHalfMarathonPreview()).resolves.toMatchObject({ kind: 'unavailable', reasonCodes: ['return_to_running_pathway_not_authored'], readiness: { state: 'returning_after_break', productionEligible: false } }); });
});
