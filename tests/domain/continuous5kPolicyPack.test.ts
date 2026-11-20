import { continuous5kPolicyRefs, simulateContinuous5kDraft, validateContinuous5kDraftSimulation, validateContinuous5kPolicyPack } from '@/domain/planning/continuous5kPolicyPack';
import { simulateFirst5kDraft } from '@/domain/planning/first5kPolicyPack';

describe('continuous-running beginner 5K draft pack', () => {
  it('renders a separate 36-session draft programme with continuous easy-run sessions', () => {
    const result = simulateContinuous5kDraft('2026-11-02');
    expect(validateContinuous5kPolicyPack()).toEqual([]);
    expect(continuous5kPolicyRefs()).toHaveLength(9);
    expect(result.kind).toBe('draft_simulation');
    if (result.kind === 'draft_simulation') {
      expect(result.sessions).toHaveLength(36);
      expect(result.sessions[0]?.steps.map((step) => step.kind)).toEqual(['warmup', 'run', 'cooldown']);
      expect(result.sessions[0]?.durationSeconds).toBe(1500);
      expect(result.sessions.find((session) => session.week === 12 && session.code === 'C')).toMatchObject({ distanceMeters: 5000, durationSeconds: null });
      expect(validateContinuous5kDraftSimulation(result)).toMatchObject({ valid: true, productionEligible: false });
    }
  });

  it('differs from the original run/walk programme and protects schedule, arithmetic, and provenance', () => {
    const continuous = simulateContinuous5kDraft('2026-11-02'); const original = simulateFirst5kDraft('2026-11-02');
    if (continuous.kind !== 'draft_simulation' || original.kind !== 'draft_simulation') throw new Error('Fixture unavailable');
    expect(continuous.sessions[0]?.durationSeconds).not.toBe(original.sessions[0]?.durationSeconds);
    const invalid = { ...continuous, sessions: continuous.sessions.map((item) => ({ ...item, steps: [...item.steps] })) };
    invalid.sessions[0] = { ...invalid.sessions[0], durationSeconds: 1, policyRefs: [] };
    invalid.sessions[9] = { ...invalid.sessions[9], durationSeconds: 9999 };
    invalid.sessions[33] = { ...invalid.sessions[33], date: invalid.sessions[32].date };
    const result = validateContinuous5kDraftSimulation(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(['policy_reference_mismatch', 'workout_arithmetic_mismatch', 'recovery_week_not_protected_w4', 'recovery_spacing_violation']));
  });

  it('blocks health concerns and infeasible three-day availability', () => {
    expect(simulateContinuous5kDraft('2026-11-02', [0, 1, 2]).kind).toBe('blocked');
    expect(validateContinuous5kDraftSimulation(simulateContinuous5kDraft('2026-11-02'), { healthConcern: true }).valid).toBe(false);
  });
});
