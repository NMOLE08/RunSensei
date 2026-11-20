import { loadBeginner5kWeeklyPreview } from '@/application/beginner5kWeeklyPreview';
import { requireActiveAccountId } from '@/application/localAccount';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { assessFitness } from '@/domain/assessment/assessFitness';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft } from '@/domain/assessment/types';
import { MemoryDatabase } from '../support/memoryDatabase';

jest.mock('@/config/experimental5kPreview', () => ({ experimental5kPreviewEnabled: true }));
jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: jest.fn() }));
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn() }));

test('persisted onboarding and assessment reach validated weekly output through the real mapper with zero preview writes', async () => {
  const db = new MemoryDatabase();
  jest.mocked(openAppDatabase).mockResolvedValue(db as never);
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-a');
  const draft = normalizeFitnessAssessmentDraft({
    ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), goal: '5k',
    weeklyMinutes: '50', comfortableRunMinutes: '45', longestSessionMinutes: '75', longestSessionDate: '2025-01-01',
    currentTrainingStatus: 'currently_training', interruption: 'none', planStartDate: '2027-01-04',
    foundationEvidenceConfirmedAt: '2027-01-04', foundationFrequency: 3,
    trainingDays: [1, 3, 6], minuteLimits: { 1: '45', 3: '45', 6: '45' }, minuteLimitConfirmedDays: [1, 3, 6],
  });
  const repo = new FitnessAssessmentRepository(db, 'account-a');
  await repo.saveDraft(draft);
  await repo.saveResult(assessFitness(draft, '2027-01-04T00:00:00Z'), draft);
  const writes = jest.spyOn(db, 'run');
  const first = await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 });
  expect(first).toMatchObject({ kind: 'preview', researchOnly: true, productionEligible: false, validation: { valid: true }, totals: { runningSeconds: 3000, walkingSeconds: 1800, scheduledSeconds: 4800 } });
  if (!('startingWorkloadComparison' in first)) throw new Error('Missing comparison');
  expect(first.startingWorkloadComparison.candidates.map(c=>c.available)).toEqual([true,false,false]);
  expect(first.startingWorkloadComparison.ledger.weeks.every(w=>w.coverage==='unknown')).toBe(true);
  expect(writes).not.toHaveBeenCalled();
  expect(await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).toEqual(first);
  expect(['plans', 'plan_revisions', 'session_assignments', 'activity_logs', 'research_foundation_blocks'].every(t => db.table(t).length === 0)).toBe(true);
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-b');
  expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toContain('account_changed');
  expect((await loadBeginner5kWeeklyPreview('account-b', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toContain('local_runner_evidence_missing');
});
