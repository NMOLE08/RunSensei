import { previewBeginner5kAdaptation, type AdaptationPreviewInput } from '@/domain/adaptation/previewBeginner5kAdaptation';
import { beginner5kAdaptationPrescriptionV02, validateBeginner5kAdaptationPrescriptionPolicy } from '@/domain/adaptation/beginner5kAdaptationPrescriptionPolicy';
import { simulateFirst5kDraft, first5kWorkoutPolicyPack } from '@/domain/planning/first5kPolicyPack';
import { simulateContinuous5kDraft, continuous5kWorkoutPolicyPack } from '@/domain/planning/continuous5kPolicyPack';
import type { Beginner5kAdaptationResult } from '@/domain/adaptation/evaluateBeginner5kAdaptation';

const decision = (kind: Beginner5kAdaptationResult['decision']): Beginner5kAdaptationResult => ({ decision: kind, policy: { policyId: 'runsensei.5k.beginner.adaptation', version: '0.1.0-draft' }, pathwayReference: { id: 'pathway', version: '0.1' }, evidenceIds: ['activity-1', 'assignment-1'], reasonCodes: ['fixture'], dataQualityWarnings: [], healthHold: kind === 'hold_for_review', productionEligible: false });
const base = (kind: Beginner5kAdaptationResult['decision'], simulation = simulateFirst5kDraft('2026-11-02')): AdaptationPreviewInput => ({ decision: decision(kind), prescriptionPolicyReference: { policyId: beginner5kAdaptationPrescriptionV02.policyId, version: beginner5kAdaptationPrescriptionV02.version }, workoutPolicyPack: first5kWorkoutPolicyPack, baseSimulation: simulation, currentWeek: 3, goalMode: 'flexible', goalDate: null, completedSourceWorkoutIds: ['runsensei.5k.first_5k_true_beginner_run_walk.pack@0.1.0-draft:w3A'], weekdayMinuteLimits: { 1: 120, 3: 120, 6: 120 }, unavailableDates: [] });

describe('System E Phase 2 draft adaptation preview', () => {
  it('keeps the prescription policy draft-only and blocked', () => {
    expect(validateBeginner5kAdaptationPrescriptionPolicy(beginner5kAdaptationPrescriptionV02)).toEqual([]);
    expect(beginner5kAdaptationPrescriptionV02).toMatchObject({ lifecycle: 'draft', releaseEligibility: 'blocked' });
  });

  it('shows unchanged previews for advance and maintain without changing assignments', () => {
    for (const kind of ['advance_candidate', 'maintain_candidate'] as const) {
      const result = previewBeginner5kAdaptation(base(kind));
      expect(result).toMatchObject({ kind: 'preview', transformation: 'unchanged', productionEligible: false });
      if (result.kind === 'preview') expect(result.after).toEqual(result.before);
    }
  });

  it('creates a 13-week, 39-session flexible-goal repeat from exact authored source stages', () => {
    const result = previewBeginner5kAdaptation(base('repeat_candidate'));
    expect(result).toMatchObject({ kind: 'preview', transformation: 'repeat_stage', productionEligible: false });
    if (result.kind !== 'preview') throw new Error('Expected preview');
    expect(result.before).toHaveLength(36); expect(result.after).toHaveLength(39);
    expect(result.after.filter((item) => item.sourceWeek === 3 && item.copiedFromSource)).toHaveLength(3);
    expect(result.after.filter((item) => item.sourceWeek === 3 && item.copiedFromSource).every((item) => item.draftAssignmentId.includes(':repeat-after-w3:'))).toBe(true);
    expect(result.after.find((item) => item.sourceWorkoutId === 'runsensei.5k.first_5k_true_beginner_run_walk.pack@0.1.0-draft:w3A' && !item.copiedFromSource)?.draftAssignmentId).toBe('runsensei.5k.first_5k_true_beginner_run_walk.pack@0.1.0-draft:source-w3A');
    expect(result.after.filter((item) => item.session.distanceMeters === 5000)).toHaveLength(1);
    expect(result.eventDateEffect).not.toBeNull();
    expect(result.validation).toMatchObject({ structurallyValid: true, productionEligible: false });
    expect(result.validation.coachingReviewWarnings).toEqual(expect.arrayContaining(['modified_progression_requires_qualified_coach_review', 'accumulated_training_workload_changed_requires_review', 'protected_recovery_week_displaced_requires_review']));
    expect(result.validation.appliedPolicyReferences).toEqual(expect.arrayContaining([...first5kWorkoutPolicyPack.policyReferences, `${beginner5kAdaptationPrescriptionV02.policyId}@${beginner5kAdaptationPrescriptionV02.version}`]));
  });

  it('uses the same source-preserving repeat mechanics for the continuous pathway', () => {
    const result = previewBeginner5kAdaptation({ ...base('repeat_candidate', simulateContinuous5kDraft('2026-11-02')), workoutPolicyPack: continuous5kWorkoutPolicyPack });
    expect(result).toMatchObject({ kind: 'preview', transformation: 'repeat_stage' });
    if (result.kind === 'preview') expect(result.after).toHaveLength(39);
  });

  it('blocks fixed-date repeats, event-stage repeats, reductions, holds, and insufficient evidence', () => {
    expect(previewBeginner5kAdaptation({ ...base('repeat_candidate'), goalMode: 'fixed_date', goalDate: '2027-01-24' })).toMatchObject({ kind: 'scheduling_conflict', reasonCodes: ['fixed_goal_date_repeat_conflict'] });
    expect(previewBeginner5kAdaptation({ ...base('repeat_candidate'), currentWeek: 12 })).toMatchObject({ kind: 'policy_gap', reasonCodes: ['repeat_event_or_unknown_stage_not_supported'] });
    expect(previewBeginner5kAdaptation(base('reduce_candidate'))).toMatchObject({ kind: 'policy_gap', reasonCodes: ['lower_workload_variant_not_authored'] });
    expect(previewBeginner5kAdaptation(base('hold_for_review'))).toMatchObject({ kind: 'hold_for_review' });
    expect(previewBeginner5kAdaptation(base('insufficient_evidence'))).toMatchObject({ kind: 'insufficient_evidence' });
  });

  it('returns structural conflicts for unavailable dates, minute limits, missing policy versions, and invalid source simulations', () => {
    expect(previewBeginner5kAdaptation({ ...base('repeat_candidate'), unavailableDates: ['2026-11-03'] })).toMatchObject({ kind: 'scheduling_conflict' });
    const limit = previewBeginner5kAdaptation({ ...base('repeat_candidate'), weekdayMinuteLimits: { 1: 1, 3: 120, 6: 120 } });
    expect(limit).toMatchObject({ kind: 'preview' }); if (limit.kind === 'preview') expect(limit.validation.violations).toContain('weekday_time_limit_conflict');
    expect(previewBeginner5kAdaptation({ ...base('repeat_candidate'), prescriptionPolicyReference: { policyId: 'missing', version: '0' } })).toMatchObject({ kind: 'policy_gap', reasonCodes: ['adaptation_prescription_policy_version_unavailable'] });
    expect(previewBeginner5kAdaptation({ ...base('repeat_candidate'), baseSimulation: { kind: 'blocked', reasons: ['bad-source'] } })).toMatchObject({ kind: 'policy_gap', reasonCodes: ['immutable_workout_policy_pack_unavailable'] });
  });
});
