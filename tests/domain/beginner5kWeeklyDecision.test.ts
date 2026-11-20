import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { normalizeBeginner5kEvidence } from '@/domain/planning/beginner5kRunnerEvidence';
import { beginnerFoundationReference, previewBeginner5kWeek, type WeeklyDecisionInput } from '@/domain/planning/beginner5kWeeklyDecision';
import { researchBlock, researchConstraints, researchEvidence, successfulOutcomes } from '../support/researchFoundationFixtures';

function input(): WeeklyDecisionInput {
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), goal: '5k' as const, weeklyMinutes: '50', comfortableRunMinutes: '45', longestSessionMinutes: '75', longestSessionDate: '2026-01-01', foundationEvidenceConfirmedAt: '2027-01-04', interruption: 'none' as const };
  return { evidence: normalizeBeginner5kEvidence(draft, researchEvidence, { ...researchConstraints, goalFamily: '5k' }, '2027-01-04', null, []), block: null, outcomes: [], week: 1, policyReference: beginnerFoundationReference };
}
test('deterministic foundation preview shows 50 running plus 30 walking minutes and preserves history', () => {
  const i = input(); const original = JSON.stringify(i); const a = previewBeginner5kWeek(i);
  expect(a).toEqual(previewBeginner5kWeek(i)); expect(a).toMatchObject({ kind: 'preview', researchOnly: true, productionEligible: false, totals: { runningSeconds: 3000, walkingSeconds: 1800, scheduledSeconds: 4800 }, validation: { valid: true } });
  expect(a.evidence.observations.find(o => o.definition === 'historical_longest_session')).toMatchObject({ included: false, value: 4500 }); expect(JSON.stringify(i)).toBe(original);
});
test('two actual days remain two sessions and confirmed daily limits are enforced', () => {
  const i = input(); i.evidence.foundation.requestedFrequency = 2; i.evidence.constraints.availableDays = [3,5].map(weekday => ({ weekday, maxMinutes: 40, confirmedByRunner: true }));
  expect(previewBeginner5kWeek(i).workouts).toHaveLength(2);
  i.evidence.constraints.availableDays = i.evidence.constraints.availableDays.map(d => ({ ...d, maxMinutes: 10 }));
  expect(previewBeginner5kWeek(i).kind).toBe('schedule_conflict');
});
test('missing current confirmation, stale fingerprints, unsupported policies and health concerns block', () => {
  const i = input(); expect(previewBeginner5kWeek({ ...i, expectedFingerprint: 'old' }).reasons).toContain('stale_evidence_revision');
  expect(previewBeginner5kWeek({ ...i, policyReference: 'unknown@1' }).kind).toBe('policy_gap');
  i.evidence.issues.push('current_confirmation_required'); expect(previewBeginner5kWeek(i).kind).toBe('evidence_gap');
  i.evidence.foundation.healthConcern = true; expect(previewBeginner5kWeek(i).kind).toBe('health_hold');
});
test('unreported and incomplete blocks cannot authorize weekly adaptation', () => {
  const i = input(); const block = researchBlock(researchEvidence, { ...researchConstraints, goalFamily: '5k' });
  expect(previewBeginner5kWeek({ ...i, block }).reasons).toContain('unreported_workouts');
  const outcomes = successfulOutcomes(block); outcomes[0]!.record.status = 'partial';
  expect(previewBeginner5kWeek({ ...i, block, outcomes }).reasons).toContain('incomplete_block_repetition_or_reduction_not_authored');
  outcomes[0]!.record.status = 'completed'; outcomes[0]!.record.difficulty = null;
  expect(previewBeginner5kWeek({ ...i, block, outcomes }).reasons).toContain('completion_feedback_required');
  outcomes[0]!.record.difficulty = 'too_difficult';
  expect(previewBeginner5kWeek({ ...i, block, outcomes }).kind).toBe('hold_for_review');
});
test('supported full-block reassessment produces a new preview without altering assignments; GPS elapsed does not replace running evidence', () => {
  const i = input(); const block = researchBlock(researchEvidence, { ...researchConstraints, goalFamily: '5k' }); const original = JSON.stringify(block);
  i.evidence.evaluatedOn = '2027-02-01'; i.evidence.confirmedAt = '2027-02-01'; i.evidence.constraints.startDate = '2027-02-01';
  const outcomes = successfulOutcomes(block);
  expect(previewBeginner5kWeek({ ...i, block, outcomes }).kind).toBe('preview'); expect(JSON.stringify(block)).toBe(original);
  outcomes[0]!.record.source = 'gps';
  expect(previewBeginner5kWeek({ ...i, block, outcomes }).reasons).toContain('comparable_total_and_running_duration_required');
});
test('outcome corrections change fingerprints, retain lineage and count only current records', () => {
  const i = input(); const block = researchBlock(researchEvidence, { ...researchConstraints, goalFamily: '5k' }); const history = successfulOutcomes(block); const old = history[0]!;
  const corrected = { ...old, id: 'correction', previousVersionId: old.id, record: { ...old.record, actualRunningSeconds: 1 } }; history.push(corrected);
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), foundationEvidenceConfirmedAt: '2027-01-04' };
  const e = normalizeBeginner5kEvidence(draft, researchEvidence, i.evidence.constraints, '2027-01-04', block, history);
  expect(e.lineage.find(o => o.id === old.id)?.current).toBe(false); expect(e.lineage.find(o => o.id === corrected.id)?.current).toBe(true); expect(e.unreportedAssignmentIds).toHaveLength(0);
  expect(previewBeginner5kWeek({ ...i, block, outcomes: history }).fingerprint).not.toBe(previewBeginner5kWeek({ ...i, block, outcomes: history.slice(0,-1) }).fingerprint);
});

test('weekly and episode revision identities deterministically invalidate fingerprints',()=>{
  const base=input();
  const identity={weeklyConfirmations:['2026-12-07:1:complete:week-r1'],trainingEpisode:'current-training-episode:1:current:2026-12-01'};
  const first=previewBeginner5kWeek({...base,evidenceRevisionIdentity:identity});
  expect(first.policyReadiness.evidenceFingerprint).toBe(first.fingerprint);
  expect(previewBeginner5kWeek({...base,evidenceRevisionIdentity:identity}).fingerprint).toBe(first.fingerprint);
  const weeklyRevision=previewBeginner5kWeek({...base,evidenceRevisionIdentity:{...identity,weeklyConfirmations:['2026-12-07:2:partial:week-r2']}});
  expect(weeklyRevision.fingerprint).not.toBe(first.fingerprint); expect(weeklyRevision.policyReadiness.revisionIdentity.weeklyConfirmations[0]).toContain(':2:partial:');
  const episodeRevision=previewBeginner5kWeek({...base,evidenceRevisionIdentity:{...identity,trainingEpisode:'current-training-episode:2:current:2026-12-08'}});
  expect(episodeRevision.fingerprint).not.toBe(first.fingerprint); expect(episodeRevision.policyReadiness.trainingEpisode).toMatchObject({revision:2,startedOn:'2026-12-08'});
});
test('health history, contradictory running totals, cross-account blocks and recovery boundaries remain blocked', () => {
  const i = input(); i.evidence.constraints.availableDays = [1,2,3].map(weekday => ({ weekday, maxMinutes: 45, confirmedByRunner: true })); expect(previewBeginner5kWeek(i).kind).not.toBe('preview');
  const block = researchBlock(); expect(previewBeginner5kWeek({ ...input(), block: { ...block, ownerId: 'account-b' } }).kind).toBe('evidence_gap');
  const outcomes = successfulOutcomes(block); outcomes[0]!.record.discomfort = 'pain_or_injury_concern'; expect(previewBeginner5kWeek({ ...input(), block, outcomes }).kind).toBe('health_hold');
});

test('contradictory outcome measurements are explicit while historical capability is not a weekly contradiction', () => {
  const i = input(); const block = researchBlock(); const outcomes = successfulOutcomes(block);
  outcomes[0]!.record.actualRunningSeconds = outcomes[0]!.record.actualDurationSeconds! + 1;
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), foundationEvidenceConfirmedAt: '2027-01-04' };
  const e = normalizeBeginner5kEvidence(draft, researchEvidence, i.evidence.constraints, '2027-01-04', block, outcomes);
  expect(e.issues).toContain('running_duration_exceeds_total_duration');
  expect(previewBeginner5kWeek({ ...i, evidence: e }).kind).toBe('evidence_gap');
  expect(i.evidence.issues).toEqual([]);
});

test('beginner and returning capacity use existing interval rules; absent post-break capability cannot be invented', () => {
  const i = input(); i.evidence.foundation.context = 'first_time_runner';
  i.evidence.foundation.currentWeeklyRunningSeconds = 600; i.evidence.foundation.currentContinuousRunningSeconds = 60;
  const beginner = previewBeginner5kWeek(i);
  expect(beginner.kind).toBe('preview'); expect(beginner.workouts[0]!.steps.some(s => s.kind === 'recovery')).toBe(true);
  i.evidence.foundation.context = 'returning_after_break'; i.evidence.foundation.demonstratedAfterBreak = false;
  expect(previewBeginner5kWeek(i).reasons).toContain('post_break_current_evidence_required');
  i.evidence.foundation.demonstratedAfterBreak = true; expect(previewBeginner5kWeek(i).kind).toBe('preview');
  i.evidence.foundation.currentWeeklyRunningSeconds = null; expect(previewBeginner5kWeek(i).reasons).toContain('demonstrated_current_running_required');
});

test('unconfirmed limits, unsupported weeks and production blocks never yield a prescription', () => {
  const i = input(); i.evidence.constraints.availableDays = i.evidence.constraints.availableDays.map(d => ({ ...d, confirmedByRunner: false }));
  expect(previewBeginner5kWeek(i).kind).not.toBe('preview');
  expect(previewBeginner5kWeek({ ...input(), week: 5 }).reasons).toContain('unsupported_foundation_week');
  const block = { ...researchBlock(), constraints: input().evidence.constraints, researchOnly: false, productionEligible: true };
  expect(previewBeginner5kWeek({ ...input(), block: block as never }).reasons).toContain('research_block_required');
});
