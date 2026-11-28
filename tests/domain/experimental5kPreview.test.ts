import { assessFitness } from '@/domain/assessment/assessFitness';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { createExperimental5kPreview } from '@/domain/research/experimental5kPreview';

const makeDraft = (ownerId: string, overrides = {}) => ({
  ...emptyFitnessAssessmentDraft(ownerId, 'Asia/Kolkata'),
  adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' as const,
  healthConcern: false, interruption: 'none' as const, goal: '5k' as const, goalFocus: 'finish' as const,
  planStartDate: '2026-11-02', trainingDays: [1, 3, 6], minuteLimits: { 1: '60', 3: '60', 6: '60' },
  minuteLimitConfirmedDays: [1, 3, 6],
  weeklyMinutes: '60', longestSessionMinutes: '25', longestSessionDate: '2026-10-30', comfortableRunMinutes: '25',
  ...overrides,
});
const preview = (draft = makeDraft('account-a')) => createExperimental5kPreview({ ownerId: draft.ownerId, draft, assessment: assessFitness(draft, '2026-11-05T12:00:00.000Z'), nowDate: '2026-11-05' });

describe('experimental 5K preview', () => {
  it('renders the exact 36-session run/walk research simulation while preserving the strict production gate', () => {
    const result = preview();
    expect(result).toMatchObject({ kind: 'preview', researchOnly: true, productionEligible: false, candidateCompatibility: { outcome: 'candidate_compatible_draft_only' }, systemC: { valid: true } });
    if (result.kind !== 'preview') throw new Error('Preview was unexpectedly blocked');
    expect(result.strictProductionGate.productionEligible).toBe(false);
    expect(result.sessions).toHaveLength(36);
    expect(result.sessions.filter((item) => item.week === 4)).toHaveLength(3);
    expect(result.sessions.find((item) => item.week === 12 && item.code === 'C')).toMatchObject({ distanceMeters: 5000, durationSeconds: null });
  });

  it('uses the distinct continuous programme only with existing compatible evidence', () => {
    const result = preview(makeDraft('account-a', { first5kExperience: 'substantial', continuousRunMinutes: undefined, comfortableRunMinutes: '20', weeklyMinutes: '50', longestSessionMinutes: '20' }));
    expect(result).toMatchObject({ kind: 'preview', pathway: { id: 'continuous_running_beginner_fixed_12_week' } });
    if (result.kind !== 'preview') throw new Error('Preview was unexpectedly blocked');
    expect(result.sessions[0]?.steps.some((step) => step.kind === 'walk')).toBe(false);
  });

  it('uses the authored run/walk draft when the general assessment reports a base-build need', () => {
    const draft = makeDraft('account-a', { comfortableRunMinutes: '10', longestSessionMinutes: '10' });
    expect(assessFitness(draft, '2026-11-05T12:00:00.000Z').code).toBe('needs_base_build');
    const result = preview(draft);
    expect(result).toMatchObject({ kind: 'preview', pathway: { id: 'true_beginner_fixed_12_week_run_walk' }, researchOnly: true, productionEligible: false });
  });

  it('allows the run/walk policy to evaluate a first-time runner without invented running history', () => {
    const draft = makeDraft('account-a', { weeklyMinutes: '', longestSessionMinutes: '', longestSessionDate: '', comfortableRunMinutes: '' });
    expect(assessFitness(draft, '2026-11-05T12:00:00.000Z').code).toBe('insufficient_information');
    expect(preview(draft)).toMatchObject({ kind: 'preview', pathway: { id: 'true_beginner_fixed_12_week_run_walk' } });
  });

  it('keeps health and interruption blocks even when the run/walk policy is available', () => {
    expect(preview(makeDraft('account-a', { healthConcern: true }))).toMatchObject({ kind: 'blocked', reasonCodes: ['health_concern_reported'] });
    expect(preview(makeDraft('account-a', { interruption: 'one_to_four_weeks' }))).toMatchObject({ kind: 'blocked', reasonCodes: ['interruption_requires_review'] });
  });

  it('does not turn two days into a three-day preview', () => {
    const result = preview(makeDraft('account-a', { trainingDays: [3, 5], minuteLimits: { 3: '60', 5: '60' } }));
    expect(result).toMatchObject({ kind: 'blocked', reasonCodes: ['two_day_policy_not_authored'], productionEligible: false });
  });

  it('uses the successor for Monday Thursday Saturday without inventing time evidence', () => {
    const draft = makeDraft('account-a', { trainingDays: [0, 3, 5], preferredLongDay: 5, minuteLimits: {}, minuteLimitConfirmedDays: [] });
    const result = preview(draft);
    expect(result).toMatchObject({ kind: 'preview', researchOnly: true, productionEligible: false });
    if (result.kind !== 'preview') throw new Error('Expected preview');
    expect(result.sessions).toHaveLength(36);
    expect(result.feasibility.warnings).toContain('torto.5k.beginner.calendar_availability@0.5.0-draft');
    expect(result.constraints.scheduling.availableDays.every(day => day.maxMinutes === null)).toBe(true);
    expect(draft.minuteLimits).toEqual({});
  });

  it('blocks an outdated assessment after relevant runner information changes', () => {
    const draft = makeDraft('account-a'); const assessment = assessFitness(draft, '2026-11-05T12:00:00.000Z');
    const result = createExperimental5kPreview({ ownerId: 'account-a', draft: { ...draft, trainingDays: [0, 2, 4], minuteLimits: { 0: '60', 2: '60', 4: '60' } }, assessment, nowDate: '2026-11-05' });
    expect(result).toMatchObject({ kind: 'blocked', reasonCodes: ['assessment_missing_or_outdated'] });
  });

  it('keeps the objective and new coaching research fields outside assessment evidence', () => {
    const draft = makeDraft('account-a');
    const assessment = assessFitness(draft, '2026-11-05T12:00:00.000Z');
    const researchOnly = {
      ...draft,
      trainingObjective: 'improve_performance' as const,
      observedWeeklyRunFrequency: 4 as const,
      runningConsistency: 'established_consistent' as const,
      runningStyle: 'continuous' as const,
      easyRunTalkTest: 'full_sentences' as const,
      usualComfortableRunEffort: 'comfortable' as const,
      preferredTrainingFrequency: 4 as const,
    };
    expect(assessmentEvidenceFingerprint(researchOnly)).toBe(assessmentEvidenceFingerprint(draft));
    expect(assessFitness(researchOnly, '2026-11-05T12:00:00.000Z').inputFingerprint).toBe(assessment.inputFingerprint);
    const result = createExperimental5kPreview({ ownerId: 'account-a', draft: researchOnly, assessment, nowDate: '2026-11-05' });
    expect(result.kind).toBe('preview');
    expect('reasonCodes' in result).toBe(false);
  });

  it('keeps preview data account-scoped and performs no persistence', () => {
    const first = preview(makeDraft('account-a')); const second = preview(makeDraft('account-b'));
    expect(first.ownerId).toBe('account-a'); expect(second.ownerId).toBe('account-b');
    expect(JSON.stringify(first)).not.toContain('activeRevisionId');
    expect(JSON.stringify(first)).not.toContain('activityLogId');
  });
});
