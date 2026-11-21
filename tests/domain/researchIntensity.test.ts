import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { normalizeCoachingEvidence } from '@/domain/coaching/normalizeEvidence';
import { evaluateResearchIntensity } from '@/domain/coaching/intensity';

it('reports observed effort without producing pace or authorizing intervals', () => {
  const draft = { ...emptyFitnessAssessmentDraft('runner-a', 'UTC'), weeklyMinutes: '90', currentTrainingStatus: 'currently_training' as const, easyRunTalkTest: 'short_phrases' as const, usualComfortableRunEffort: 'comfortable' as const, runningStyle: 'run_walk' as const, trainingObjective: 'improve_performance' as const };
  const evidence = normalizeCoachingEvidence(draft, '2026-11-22');
  const decision = evaluateResearchIntensity(evidence);
  expect(decision.observed).toEqual({ runningStyle: 'run_walk', talkTest: 'short_phrases', usualEffort: 'comfortable' });
  expect(decision.pace.state).toBe('uncalibrated');
  expect(decision.qualityWork.state).toBe('not_evaluated');
  expect(decision).toEqual(evaluateResearchIntensity(normalizeCoachingEvidence(draft, '2026-11-22')));
});

it('withholds quality evaluation under supplied health concerns and identifies unknown observations', () => {
  const decision = evaluateResearchIntensity(normalizeCoachingEvidence({ ...emptyFitnessAssessmentDraft('runner-a', 'UTC'), healthConcern: true }, '2026-11-22'));
  expect(decision.qualityWork.state).toBe('withheld');
  expect(decision.limitations).toEqual(expect.arrayContaining(['not_currently_training', 'talk_test_unknown', 'usual_effort_unknown', 'existing_health_hold']));
  expect(decision).not.toHaveProperty('workouts');
});
