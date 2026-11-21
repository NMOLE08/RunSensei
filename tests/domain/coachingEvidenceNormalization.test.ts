import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { normalizeCoachingEvidence } from '@/domain/coaching/normalizeEvidence';

const base = () => emptyFitnessAssessmentDraft('runner-a', 'UTC');
const on = '2026-11-22';

it('preserves units, original performance context, and actual observation dates', () => {
  const evidence = normalizeCoachingEvidence({ ...base(), weeklyDistance: '2', weeklyDistanceUnit: 'mi', longestSessionDistance: '5', longestSessionDistanceUnit: 'km', longestSessionDate: '2026-11-01', weeklyEvidenceConfirmedAt: '2026-11-20', performanceDistanceMeters: '5000', performanceSeconds: '1800', performanceDate: '2026-10-01', performanceKind: 'normal_run', performanceEffort: 'easy' }, on);
  expect(evidence.weeklyDistance).toMatchObject({ state: 'available', value: { originalValue: 2, unit: 'mi', meters: 3218.688 }, observedOn: null, confirmedOn: '2026-11-20' });
  expect(evidence.longestDistance).toMatchObject({ state: 'available', value: { meters: 5000 }, observedOn: '2026-11-01' });
  expect(evidence.performance).toMatchObject({ kind: 'normal_run', effort: 'easy', suitability: 'non_maximal', date: '2026-10-01' });
});

it('separates missing from zero and preserves variable, five-plus and unknown frequency', () => {
  expect(normalizeCoachingEvidence(base(), on).weeklyMinutes.state).toBe('missing');
  expect(normalizeCoachingEvidence({ ...base(), weeklyMinutes: '0' }, on).weeklyMinutes).toMatchObject({ state: 'available', value: 0 });
  expect(normalizeCoachingEvidence({ ...base(), observedWeeklyRunFrequency: 'variable' }, on).observedFrequency).toMatchObject({ value: { kind: 'variable' } });
  expect(normalizeCoachingEvidence({ ...base(), observedWeeklyRunFrequency: '5_plus' }, on).observedFrequency).toMatchObject({ value: { kind: 'five_or_more' } });
  expect(normalizeCoachingEvidence(base(), on).observedFrequency.state).toBe('unknown');
});

it('does not refresh fitness evidence or identity when draft metadata and preferences change', () => {
  const original = normalizeCoachingEvidence({ ...base(), weeklyMinutes: '90', updatedAt: '2026-11-01T00:00:00Z' }, on);
  const edited = normalizeCoachingEvidence({ ...base(), weeklyMinutes: '90', updatedAt: '2026-11-22T00:00:00Z' }, on);
  expect(edited.identity).toBe(original.identity);
  expect(edited.weeklyMinutes).toMatchObject({ observedOn: null, confirmedOn: null });
});

it('does not claim normalized legacy objective was explicitly chosen', () => {
  const legacy = normalizeCoachingEvidence({ ...base(), schemaVersion: 7, goalFocus: 'target_time', trainingObjective: 'improve_performance' }, on);
  expect(legacy.objective).toEqual({ value: 'improve_performance', origin: 'legacy_derived' });
  expect(normalizeCoachingEvidence(base(), on).objective.origin).toBe('uncertain_explicit_or_default');
});
