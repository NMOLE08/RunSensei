import { renderBeginner5kResearchReport, runBeginner5kResearchSimulation, type Beginner5kResearchFixture, type ResearchScenario } from '@/domain/research/runBeginner5kResearchSimulation';
import { beginner5kContinuousCandidatePersonalizationPolicy } from '@/domain/planning/beginner5kPersonalizationPolicy';

const scenarios: readonly ResearchScenario[] = ['completed_week', 'partial', 'missed', 'unreported', 'one_difficult', 'repeated_difficult', 'fatigue', 'pain', 'corrected', 'policy_mismatch', 'scheduling_conflict', 'event_preservation'];
const expected: Record<ResearchScenario, string> = { completed_week: 'advance_candidate', partial: 'repeat_candidate', missed: 'repeat_candidate', unreported: 'insufficient_evidence', one_difficult: 'maintain_candidate', repeated_difficult: 'reduce_candidate', fatigue: 'hold_for_review', pain: 'hold_for_review', corrected: 'advance_candidate', policy_mismatch: 'policy_gap', scheduling_conflict: 'advance_candidate', event_preservation: 'advance_candidate' };

function fixture(path: 'run_walk' | 'continuous', scenario: ResearchScenario, goalMode: 'fixed_date' | 'flexible' = 'flexible'): Beginner5kResearchFixture {
  const continuous = path === 'continuous'; const policy = continuous ? beginner5kContinuousCandidatePersonalizationPolicy : beginner5kContinuousCandidatePersonalizationPolicy;
  const pathwayId = continuous ? 'continuous_running_beginner_fixed_12_week' : 'true_beginner_fixed_12_week_run_walk';
  return {
    id: `${path}-${scenario}-${goalMode}`, simulationDate: '2026-11-02', pathwayPolicyReference: { policyId: policy.policyId, version: policy.version }, pathwayId, pathwayVersion: '0.1.0-draft',
    strictInput: { adultAgeConfirmed: true, canWalk30MinutesComfortably: true, experience: continuous ? 'substantial' : 'none_or_limited', healthConcern: false, interruption: 'none', goal: 'first_5k_completion', goalFocus: 'completion', planStartDate: '2026-11-02', availableDays: [1, 3, 6], continuousRunMinutes: continuous ? 20 : null, weeklyRunningMinutes: continuous ? 50 : null, weeklyDistance: null, longestRecentSessionMinutes: continuous ? 20 : null, weekdayMinuteLimits: { 1: 120, 3: 120, 6: 120 } },
    candidateEvidence: { adultAgeConfirmed: true, canWalk30MinutesComfortably: true, healthConcern: false, interruption: 'none', planStartDate: '2026-11-02', availableDays: [1, 3, 6], weekdayMinuteLimits: { 1: 120, 3: 120, 6: 120 }, continuousRunMinutes: continuous ? 20 : null, weeklyRunningMinutes: continuous ? 50 : null, longestRecentSessionMinutes: continuous ? 20 : null, historyAgeDays: continuous ? 7 : null, longestSessionAgeDays: continuous ? 7 : null },
    goalMode, goalDate: goalMode === 'fixed_date' ? '2027-01-24' : null, currentWeek: 3, scenario,
  };
}

describe('A–E research-only beginner 5K integration', () => {
  for (const path of ['run_walk', 'continuous'] as const) {
    it.each(scenarios)('runs deterministic %s scenario for ' + path, (scenario) => {
      const subject = fixture(path, scenario);
      const first = runBeginner5kResearchSimulation(subject); const second = runBeginner5kResearchSimulation(subject);
      expect(first).toMatchObject({ researchOnly: true, productionEligible: false, fixtureId: subject.id });
      expect(first.strictGate).toMatchObject({ kind: 'policy_gap', productionEligible: false });
      expect(first.candidateCompatibility).toMatchObject({ outcome: 'candidate_compatible_draft_only', productionEligible: false });
      expect(first.systemC).toMatchObject({ valid: true });
      expect(first.adaptation.decision).toBe(expected[scenario]);
      expect(first.provenance).toEqual(second.provenance);
      expect(first.analysisIds).toEqual(second.analysisIds);
      expect(first.preview.productionEligible).toBe(false);
    });
  }

  it('creates a 39-session repeat preview only for flexible goals and preserves source history and the final event', () => {
    for (const path of ['run_walk', 'continuous'] as const) {
      const result = runBeginner5kResearchSimulation(fixture(path, 'partial'));
      expect(result.preview).toMatchObject({ kind: 'preview', transformation: 'repeat_stage' });
      if (result.preview.kind === 'preview') {
        expect(result.preview.after).toHaveLength(39); expect(result.preview.after.filter((item) => item.session.distanceMeters === 5000)).toHaveLength(1);
        expect(result.preview.validation).toMatchObject({ structurallyValid: true, productionEligible: false });
        expect(result.preview.after.filter((item) => item.copiedFromSource).map((item) => item.draftAssignmentId)).toHaveLength(3);
        expect(new Set(result.preview.after.map((item) => item.draftAssignmentId)).size).toBe(39);
      }
    }
  });

  it('rejects fixed-goal repeats, blocks unsupported reductions, holds, missing evidence, and schedule conflicts from actionable previews', () => {
    for (const path of ['run_walk', 'continuous'] as const) {
      expect(runBeginner5kResearchSimulation(fixture(path, 'partial', 'fixed_date')).preview).toMatchObject({ kind: 'scheduling_conflict', reasonCodes: ['fixed_goal_date_repeat_conflict'] });
      expect(runBeginner5kResearchSimulation(fixture(path, 'repeated_difficult')).preview).toMatchObject({ kind: 'policy_gap' });
      expect(runBeginner5kResearchSimulation(fixture(path, 'fatigue')).preview).toMatchObject({ kind: 'hold_for_review' });
      expect(runBeginner5kResearchSimulation(fixture(path, 'unreported')).preview).toMatchObject({ kind: 'insufficient_evidence' });
      expect(runBeginner5kResearchSimulation(fixture(path, 'scheduling_conflict')).preview).toMatchObject({ kind: 'scheduling_conflict' });
    }
  });

  it('counts corrected outcomes once and preserves unreported separately from missed', () => {
    const corrected = runBeginner5kResearchSimulation(fixture('run_walk', 'corrected'));
    expect(corrected.weekly).toMatchObject({ completed: 3, unreported: 0, reportedOutcomes: 3 });
    expect(corrected.completions).toHaveLength(4);
    const unreported = runBeginner5kResearchSimulation(fixture('continuous', 'unreported'));
    expect(unreported.weekly).toMatchObject({ completed: 2, missed: 0, unreported: 1 });
  });

  it('renders a developer report from the actual research result without writing or activating anything', () => {
    const report = renderBeginner5kResearchReport(runBeginner5kResearchSimulation(fixture('run_walk', 'partial')));
    expect(report).toContain('Strict user-facing gate: policy_gap');
    expect(report).toContain('System E: repeat_candidate');
    expect(report).toContain('Research only: true');
  });
});
