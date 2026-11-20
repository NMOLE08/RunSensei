import { loadBeginner5kWeeklyPreview, saveBeginner5kTrainingEpisode, saveBeginner5kWeeklyConfirmation } from '@/application/beginner5kWeeklyPreview';
import { requireActiveAccountId } from '@/application/localAccount';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { currentInputs } from '@/application/researchFoundation';
import { researchConstraints, researchEvidence } from '../support/researchFoundationFixtures';
import { MemoryDatabase } from '../support/memoryDatabase';

const mockLoad = jest.fn(); const mockAssessment = jest.fn();
let mockAccess = true;
jest.mock('@/config/experimental5kPreview', () => ({ get experimental5kPreviewEnabled() { return mockAccess; } }));
jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: jest.fn() }));
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn() }));
jest.mock('@/data/fitnessAssessmentRepository', () => ({ FitnessAssessmentRepository: jest.fn().mockImplementation(() => ({ loadDraft: mockLoad, resultForInputFingerprint: mockAssessment })) }));
jest.mock('@/data/researchFoundationRepository', () => ({ ResearchFoundationRepository: jest.fn().mockImplementation(() => ({ blocks: async () => [], get: async () => null })) }));
jest.mock('@/application/researchFoundation', () => ({ currentInputs: jest.fn() }));

beforeEach(() => {
  mockAccess = true;
  jest.mocked(currentInputs).mockImplementation(() => ({ evidence: { ...researchEvidence }, constraints: { ...researchConstraints, goalFamily: '5k' } }));
});

beforeEach(() => { jest.clearAllMocks(); jest.mocked(requireActiveAccountId).mockResolvedValue('account-a'); jest.mocked(openAppDatabase).mockResolvedValue({ getAll: jest.fn(async () => []), run: jest.fn(() => { throw new Error('preview must not write'); }), transaction: jest.fn(() => { throw new Error('preview must not write'); }) } as never); mockLoad.mockResolvedValue({ ...emptyFitnessAssessmentDraft('account-a', 'UTC'), foundationEvidenceConfirmedAt: '2027-01-04', interruption: 'none', goal: '5k' }); mockAssessment.mockResolvedValue({}); });
test('account-scoped preview generates from local evidence and performs no database writes', async () => {
  const result = await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 }); expect(result.kind).toBe('preview'); expect(result.productionEligible).toBe(false);
  expect((await openAppDatabase()).run).not.toHaveBeenCalled(); expect((await openAppDatabase()).transaction).not.toHaveBeenCalled();
  expect(researchEvidence.currentWeeklyRunningSeconds).toBe(3000); expect(researchConstraints.goalFamily).toBe('half_marathon');
});
test('changed accounts, missing assessments and changed evidence cannot expose a stale preview', async () => {
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-b'); expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toContain('account_changed');
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-a'); mockAssessment.mockResolvedValue(null); expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toContain('current_account_assessment_required');
  mockAssessment.mockResolvedValue({}); expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1, expectedFingerprint: 'obsolete' })).reasons).toContain('stale_evidence_revision');
});

test('disabled research access performs no reads and no writes', async () => {
  mockAccess = false;
  expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toEqual(['research_access_disabled']);
  expect(openAppDatabase).not.toHaveBeenCalled();
});

test('changes during local reads invalidate the result instead of returning mixed evidence', async () => {
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), foundationEvidenceConfirmedAt: '2027-01-04', interruption: 'none' as const, goal: '5k' as const };
  mockLoad.mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...draft, comfortableRunMinutes: '60' });
  expect((await loadBeginner5kWeeklyPreview('account-a', { evaluatedOn: '2027-01-04', week: 1 })).reasons).toEqual(['runner_evidence_changed_during_preview']);
});

test('new GPS evidence between reads invalidates comparison even when onboarding is unchanged', async () => {
  const db = await openAppDatabase();
  let trackingReads=0; jest.mocked(db.getAll).mockImplementation(async sql=>sql.includes('tracking_sessions') && trackingReads++ ? [{ id:'gps',owner_id:'account-a',started_at_ms:Date.parse('2027-01-03T01:00:00Z'),ended_at_ms:Date.parse('2027-01-03T01:10:00Z'),segments_json:JSON.stringify([{startedAtMs:Date.parse('2027-01-03T01:00:00Z'),endedAtMs:Date.parse('2027-01-03T01:10:00Z')}]),status_reason:'gps' }] : []);
  expect((await loadBeginner5kWeeklyPreview('account-a', {evaluatedOn:'2027-01-04',week:1})).reasons).toContain('runner_evidence_changed_during_preview');
  expect(db.run).not.toHaveBeenCalled();
});

test('weekly confirmation saves, reloads, withdraws to unknown, and rejects a stale revision',async()=>{
  const db=new MemoryDatabase(); jest.mocked(openAppDatabase).mockResolvedValue(db);
  const saved=await saveBeginner5kWeeklyConfirmation('account-a',{weekStart:'2026-12-07',timezone:'UTC',coverage:'complete',expectedRevision:0,evaluatedOn:'2027-01-04'});
  expect(saved).toMatchObject({ok:true,coverage:'complete',revision:1});
  const reloaded=await loadBeginner5kWeeklyPreview('account-a',{evaluatedOn:'2027-01-04',week:1});
  expect('weeklyConfirmations' in reloaded && reloaded.weeklyConfirmations.find(item=>item.weekStart==='2026-12-07')).toMatchObject({coverage:'complete',revision:1});
  expect(await saveBeginner5kWeeklyConfirmation('account-a',{weekStart:'2026-12-07',timezone:'UTC',coverage:'partial',expectedRevision:0,evaluatedOn:'2027-01-04'})).toMatchObject({ok:false,stale:true});
  expect(await saveBeginner5kWeeklyConfirmation('account-a',{weekStart:'2026-12-07',timezone:'UTC',coverage:'unknown',expectedRevision:1,evaluatedOn:'2027-01-04'})).toMatchObject({ok:true,coverage:'unknown',revision:2});
  const withdrawn=await loadBeginner5kWeeklyPreview('account-a',{evaluatedOn:'2027-01-04',week:1});
  expect('weeklyConfirmations' in withdrawn && withdrawn.weeklyConfirmations.find(item=>item.weekStart==='2026-12-07')).toMatchObject({coverage:'unknown',revision:2});
  expect(db.table('research_weekly_evidence')).toHaveLength(2);
});

test('training episode start, correction and withdrawal reload with new evidence fingerprints',async()=>{
  const db=new MemoryDatabase(); jest.mocked(openAppDatabase).mockResolvedValue(db);
  const initial=await loadBeginner5kWeeklyPreview('account-a',{evaluatedOn:'2027-01-04',week:1});
  expect('trainingEpisode' in initial && initial.trainingEpisode).toBeNull();
  const first=await saveBeginner5kTrainingEpisode('account-a',{startedOn:'2026-12-01',timezone:'UTC',expectedRevision:0,evaluatedOn:'2027-01-04'});
  expect(first).toMatchObject({ok:true,revision:1,status:'current',startedOn:'2026-12-01'});
  const current=await loadBeginner5kWeeklyPreview('account-a',{evaluatedOn:'2027-01-04',week:1});
  expect('trainingEpisode' in current && current.trainingEpisode).toMatchObject({revision:1,status:'current',startedOn:'2026-12-01'});
  expect('fingerprint' in initial && 'fingerprint' in current && current.fingerprint).not.toBe('fingerprint' in initial ? initial.fingerprint : '');
  expect(await saveBeginner5kTrainingEpisode('account-a',{startedOn:'2026-12-08',timezone:'UTC',expectedRevision:1,evaluatedOn:'2027-01-04'})).toMatchObject({ok:true,revision:2});
  expect(await saveBeginner5kTrainingEpisode('account-a',{startedOn:null,timezone:'UTC',expectedRevision:2,evaluatedOn:'2027-01-04'})).toMatchObject({ok:true,revision:3,status:'unknown'});
  const unknown=await loadBeginner5kWeeklyPreview('account-a',{evaluatedOn:'2027-01-04',week:1});
  expect('trainingEpisode' in unknown && unknown.trainingEpisode).toMatchObject({revision:3,status:'unknown',startedOn:null});
  expect(db.table('research_training_episodes')).toHaveLength(3);
});

test('training episode save rejects stale revisions and another active account',async()=>{
  const db=new MemoryDatabase(); jest.mocked(openAppDatabase).mockResolvedValue(db);
  await saveBeginner5kTrainingEpisode('account-a',{startedOn:'2026-12-01',timezone:'UTC',expectedRevision:0,evaluatedOn:'2027-01-04'});
  expect(await saveBeginner5kTrainingEpisode('account-a',{startedOn:'2026-12-02',timezone:'UTC',expectedRevision:0,evaluatedOn:'2027-01-04'})).toMatchObject({ok:false,stale:true});
  jest.mocked(requireActiveAccountId).mockResolvedValue('account-b');
  expect(await saveBeginner5kTrainingEpisode('account-a',{startedOn:'2026-12-02',timezone:'UTC',expectedRevision:1,evaluatedOn:'2027-01-04'})).toMatchObject({ok:false,error:'account_changed'});
});
