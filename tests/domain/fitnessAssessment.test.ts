import { assessFitness } from '@/domain/assessment/assessFitness';
import { assessmentEvidenceFingerprint, assessmentEvidenceProjection } from '@/domain/assessment/assessmentEvidence';
import { fingerprint } from '@/domain/context';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { buildSystemAPlanningInput } from '@/application/systemAPlanningInput';

const complete = () => ({ ...emptyFitnessAssessmentDraft('runner-1', 'Asia/Kolkata'), weeklyMinutes: '90', longestSessionMinutes: '30', longestSessionDate: '2026-11-01', comfortableRunMinutes: '25', interruption: 'none' as const, trainingDays: [0, 2, 5], minuteLimits: { 0: '45', 2: '45', 5: '60' } });

it('keeps missing evidence explicit', () => expect(assessFitness(emptyFitnessAssessmentDraft('runner-1', 'UTC'), '2026-11-03T00:00:00.000Z').code).toBe('insufficient_information'));
it('preserves health hold over normal classification', () => expect(assessFitness({ ...complete(), healthConcern: true }, '2026-11-03T00:00:00.000Z').code).toBe('health_hold'));
it('requires reassessment after a long interruption', () => expect(assessFitness({ ...complete(), interruption: 'over_four_weeks' }, '2026-11-03T00:00:00.000Z').code).toBe('needs_reassessment'));
it('flags too-short fixed dates without making a plan', () => expect(assessFitness({ ...complete(), goalDateFixed: true, goalDate: '2026-11-15' }, '2026-11-03T00:00:00.000Z').code).toBe('goal_date_incompatible'));
it('classifies complete evidence and leaves policy selection separate', () => { const result = assessFitness(complete(), '2026-11-03T00:00:00.000Z'); expect(result.code).toBe('eligible_for_policy_selection'); expect(result.classification).toBe('beginner'); });
it('changes classification when materially stronger evidence is supplied', () => expect(assessFitness({ ...complete(), weeklyMinutes: '180', comfortableRunMinutes: '35' }, '2026-11-03T00:00:00.000Z').classification).toBe('intermediate'));
it('only exposes eligible assessments to planning and excludes Strava provenance', () => { const draft = complete(); const input = buildSystemAPlanningInput(draft, assessFitness(draft, '2026-11-03T00:00:00.000Z')); expect(input.provenance.stravaExcluded).toBe(true); expect(() => buildSystemAPlanningInput(emptyFitnessAssessmentDraft('runner-1', 'UTC'), assessFitness(emptyFitnessAssessmentDraft('runner-1', 'UTC')))).toThrow('Planning is unavailable'); });

it('does not make an assessment stale when only technical record metadata changes', () => {
  const input = { ...complete(), updatedAt: '2026-11-03T10:00:00.000Z', ownerId: 'runner-a' };
  const reopened = { ...input, updatedAt: '2026-11-03T10:00:01.000Z', ownerId: 'runner-b', id: 'system-a' as const, schemaVersion: 6 as const };
  expect(assessmentEvidenceFingerprint(reopened)).toBe(assessmentEvidenceFingerprint(input));
  expect(assessmentEvidenceProjection(reopened)).not.toHaveProperty('updatedAt');
  expect(assessmentEvidenceProjection(reopened)).not.toHaveProperty('ownerId');
});

it('does make an assessment stale when meaningful running evidence changes', () => {
  const input = complete();
  expect(assessmentEvidenceFingerprint({ ...input, weeklyMinutes: '120' })).not.toBe(assessmentEvidenceFingerprint(input));
  // Documents that legacy full-draft fingerprints remain deliberately distinct.
  expect(assessFitness(input).inputFingerprint).not.toBe(fingerprint(input));
});

it('includes the explicit foundation frequency in the saved evidence identity', () => {
  const input = { ...complete(), foundationEvidenceConfirmedAt: '2026-11-03', foundationFrequency: null };
  expect(assessmentEvidenceFingerprint({ ...input, foundationFrequency: 2 })).not.toBe(assessmentEvidenceFingerprint(input));
  expect(assessmentEvidenceProjection({ ...input, foundationFrequency: 3 }).foundationFrequency).toBe(3);
});

it('keeps the coach presentation preference outside assessment evidence and eligibility', () => {
  const input = complete();
  expect(assessmentEvidenceFingerprint({ ...input, coachId: 'moss' })).toBe(assessmentEvidenceFingerprint(input));
  expect(assessmentEvidenceFingerprint({ ...input, coachId: 'jett' })).toBe(assessmentEvidenceFingerprint(input));
  expect(assessmentEvidenceFingerprint({ ...input, coachId: 'jett', coachIntroAcknowledged: true })).toBe(assessmentEvidenceFingerprint(input));
  expect(assessFitness({ ...input, coachId: 'moss' }).code).toBe(assessFitness({ ...input, coachId: 'jett' }).code);
});
