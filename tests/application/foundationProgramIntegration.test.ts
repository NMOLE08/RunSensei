import { writeFileSync, mkdirSync } from 'node:fs';
import { openCurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';
import { loadCurrentAccountPlanFacts } from '@/application/planAvailability';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import { assessFitness } from '@/domain/assessment/assessFitness';
jest.mock('@/application/planAvailability', () => ({ loadCurrentAccountPlanFacts: jest.fn() }));
const load = jest.mocked(loadCurrentAccountPlanFacts);
const scenarios: [string, Partial<FitnessAssessmentDraft>, string][] = [
  ['missing-frequency', { foundationFrequency: null }, 'blocked'],
  ['three-days', {}, 'foundation_program'],
  ['two-days-37-minute-limit', { foundationFrequency: 2, trainingDays: [3,5], minuteLimits: {3:'37',5:'37'}, minuteLimitConfirmedDays: [3,5] }, 'foundation_program'],
  ['two-days-35-minute-limit', { foundationFrequency: 2, trainingDays: [3,5], minuteLimits: {3:'35',5:'35'}, minuteLimitConfirmedDays: [3,5] }, 'foundation_program'],
  ['two-days', { foundationFrequency: 2, trainingDays: [3,5] }, 'foundation_program'],
  ['two-days-insufficient-time', { foundationFrequency: 2, trainingDays: [3,5], minuteLimits: {3:'30',5:'30'} }, 'foundation_program'],
  ['new-account-no-time', { minuteLimits: {}, minuteLimitConfirmedDays: [] }, 'foundation_program'],
  ['two-days-no-time', { foundationFrequency: 2, trainingDays: [3,5], minuteLimits: {}, minuteLimitConfirmedDays: [] }, 'foundation_program'],
  ['walk-run', { currentTrainingStatus: 'first_time_runner', weeklyMinutes: '5', comfortableRunMinutes: '0.5', longestSessionMinutes: '', longestSessionDate: '' }, 'foundation_program'],
  ['missing-current', { weeklyMinutes: '' }, 'blocked'],
  ['health-hold', { healthConcern: true }, 'blocked'],
  ['return-current', { currentTrainingStatus:'returning_after_break', interruption:'over_four_weeks', interruptionReason:'schedule_or_travel', foundationPostBreakConfirmed:true, weeklyMinutes:'5', comfortableRunMinutes:'0.5' }, 'foundation_program'],
  ['return-historical-only', {currentTrainingStatus:'returning_after_break', interruption:'over_four_weeks'}, 'blocked'],
  ['5k-goal', {goal:'5k'}, 'foundation_program'],
  ['10k-goal', {goal:'10k'}, 'foundation_program'],
  ['marathon-goal', {goal:'marathon'}, 'foundation_program'],
];
it.each(scenarios)('passes %s through saved evidence and assessment into the preview adapter', async (id, changes, kind) => {
  const draft: FitnessAssessmentDraft = { ...emptyFitnessAssessmentDraft(`synthetic-${id}`, 'Asia/Kolkata'), goal: 'half_marathon', weeklyMinutes: '50', comfortableRunMinutes: '45', longestSessionMinutes: '75', longestSessionDate: '2025-01-01', interruption: 'none', currentTrainingStatus: 'currently_training', planStartDate: '2027-01-04', foundationEvidenceConfirmedAt: '2027-01-01', foundationFrequency: 3, trainingDays: [1,3,6], minuteLimits: {1:'45',3:'45',5:'45',6:'45'}, minuteLimitConfirmedDays: [1,3,5,6], ...changes };
  const facts = {ownerId: draft.ownerId, draft, assessment: assessFitness(draft, '2027-01-01T00:00:00Z'), activeSnapshot: null};
  load.mockResolvedValue(facts);
  const before = JSON.stringify(facts);
  const result = await openCurrentExperimentalHalfMarathonPreview();
  expect(result.kind).toBe(kind);
  expect(result).toMatchObject({ researchOnly: true, productionEligible: false });
  if (result.kind === 'foundation_program') expect(result.policyReference).toBe('runsensei.foundation.multiweek@0.3.0-draft');
  expect(await openCurrentExperimentalHalfMarathonPreview()).toEqual(result);
  expect(JSON.stringify(facts)).toBe(before);
  if (result.kind === 'foundation_program') { expect(result.weeks).toHaveLength(4); expect(result.workouts).toHaveLength(4 * draft.foundationFrequency!); expect(result.validation.valid).toBe(true); }
  if (id === 'two-days-insufficient-time' && result.kind === 'blocked') expect(result.reasonCodes).toContain('session_exceeds_time_limit');
  if (id === 'two-days-35-minute-limit' && result.kind === 'blocked') expect(result.reasonCodes).toContain('no_complete_schedule');
  if (id === 'missing-frequency' && result.kind === 'blocked') expect(result.reasonCodes).toContain('foundation_frequency_required');
  if (process.env.EXPORT_FOUNDATION_FIXTURES === 'true') { mkdirSync('artifacts/foundation/multiweek', {recursive:true}); writeFileSync(`artifacts/foundation/multiweek/${id}.json`, JSON.stringify({ synthetic:true, input:draft, assessment:facts.assessment, result }, null, 2)); }
});
