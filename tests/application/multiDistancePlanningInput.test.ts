import { buildMultiDistancePlanningInput } from '@/application/multiDistancePlanningInput';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentResult } from '@/domain/assessment/types';

const assessment: FitnessAssessmentResult = { version: 'system-a-v1', code: 'eligible_for_policy_selection', classification: 'intermediate', confidence: 'approximate', reasons: [], missing: [], alternatives: [], inputFingerprint: 'f', createdAt: '2027-01-01T00:00:00.000Z' };
function draft() { return { ...emptyFitnessAssessmentDraft('owner-a', 'Asia/Calcutta'), goal: 'half_marathon' as const, planStartDate: '2027-01-02', trainingDays: [1, 3, 6], minuteLimits: { 1: '45', 3: '45', 6: '90' }, minuteLimitConfirmedDays: [1, 3, 6], interruption: 'none' as const, weeklyMinutes: '120', longestSessionMinutes: '60', longestSessionDate: '2026-12-30', comfortableRunMinutes: '40' }; }
describe('multi-distance planning input', () => {
  it('maps half-marathon onboarding into neutral policy constraints without choosing a policy', () => {
    const result = buildMultiDistancePlanningInput(draft(), assessment);
    expect(result).toMatchObject({ kind: 'ready', goalFamily: 'half_marathon', constraints: { startDate: '2027-01-04', ownerId: 'owner-a' } });
  });
  it('blocks health holds and preserves missing policy as a separate later concern', () => {
    expect(buildMultiDistancePlanningInput({ ...draft(), healthConcern: true }, assessment)).toEqual({ kind: 'blocked', reasonCodes: ['health_hold'] });
  });
});
