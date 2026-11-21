import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { intensityEvidenceFromDraft, workloadEvidenceFromDraft } from '@/domain/assessment/coachingEvidence';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft } from '@/domain/assessment/types';

describe('V2 coaching evidence', () => {
  it('normalizes a schema-7 draft without reinterpreting its historical goal focus', () => {
    const legacy = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), schemaVersion: 7 as const, trainingObjective: undefined, observedWeeklyRunFrequency: undefined, runningConsistency: undefined, longestSessionDistance: undefined, runningStyle: undefined, easyRunTalkTest: undefined, usualComfortableRunEffort: undefined, preferredTrainingFrequency: undefined, goalFocus: 'target_time' as const };
    const restored = normalizeFitnessAssessmentDraft(legacy as unknown as typeof legacy);
    expect(restored).toMatchObject({ schemaVersion: 8, goalFocus: 'target_time', trainingObjective: 'improve_performance', observedWeeklyRunFrequency: 'unknown', preferredTrainingFrequency: 'unknown' });
  });

  it('keeps V2 evidence out of the existing assessment fingerprint and eligibility contract', () => {
    const base = emptyFitnessAssessmentDraft('account-a', 'UTC');
    const v2 = { ...base, trainingObjective: 'improve_performance' as const, observedWeeklyRunFrequency: 4 as const, runningConsistency: 'established_consistent' as const, longestSessionDistance: '8', runningStyle: 'continuous' as const, easyRunTalkTest: 'full_sentences' as const, usualComfortableRunEffort: 'comfortable' as const, preferredTrainingFrequency: 4 as const };
    expect(assessmentEvidenceFingerprint(v2)).toBe(assessmentEvidenceFingerprint(base));
  });

  it('exposes provenance-aware intensity and workload evidence without generating pace or workload output', () => {
    const draft = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), updatedAt: '2026-11-21T12:00:00.000Z', runningStyle: 'run_walk' as const, easyRunTalkTest: 'short_phrases' as const, usualComfortableRunEffort: 'somewhat_hard' as const, observedWeeklyRunFrequency: 'variable' as const, preferredTrainingFrequency: 3 as const, longestSessionDistance: '6.2' };
    expect(intensityEvidenceFromDraft(draft)).toMatchObject({ provenance: { source: 'runner_reported_onboarding_v2', draftSchemaVersion: 8 }, runningStyle: 'run_walk', easyRunTalkTest: 'short_phrases' });
    expect(workloadEvidenceFromDraft(draft)).toMatchObject({ observedWeeklyRunFrequency: 'variable', preferredTrainingFrequency: 3, longestSession: { distance: '6.2' } });
  });
});
