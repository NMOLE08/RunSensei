import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { normalizeCoachingEvidence } from '@/domain/coaching/normalizeEvidence';
import { evaluateCoachingEvidence } from '@/domain/coaching/evaluateEvidence';

const base = () => emptyFitnessAssessmentDraft('runner-a', 'UTC');
const evaluate = (change: Partial<ReturnType<typeof base>>) => evaluateCoachingEvidence(normalizeCoachingEvidence({ ...base(), weeklyMinutes: '90', ...change }, '2026-11-22'));

it('reports source-grounded status contradiction and malformed values', () => {
  expect(evaluate({ runningConsistency: 'currently_inactive', currentTrainingStatus: 'currently_training' })).toMatchObject({ state: 'review_required', issues: [{ code: 'inactive_consistency_conflicts_with_current_training', fields: ['runningConsistency', 'currentTrainingStatus'] }] });
  expect(evaluate({ longestSessionDistance: '-3' }).issues).toEqual(expect.arrayContaining([{ code: 'longestSessionDistance_invalid', fields: ['longestSessionDistance'] }]));
});

it('does not treat unusual distance and time combinations as a contradiction', () => {
  expect(evaluate({ weeklyDistance: '100', weeklyMinutes: '10' }).issues).toEqual([]);
});

it('honors existing hold signals without changing the existing assessment identity', () => {
  expect(evaluate({ healthConcern: true }).state).toBe('held');
  expect(evaluate({ interruption: 'over_four_weeks' }).state).toBe('held');
  const old = base();
  expect(assessmentEvidenceFingerprint({ ...old, easyRunTalkTest: 'full_sentences', observedWeeklyRunFrequency: 3, trainingObjective: 'improve_performance' })).toBe(assessmentEvidenceFingerprint(old));
});
