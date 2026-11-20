import { buildWeeklyEvidenceLedger, classifyLedgerSessionsByEpisode, normalizeBeginner5kEvidence, researchLedgerSessions, runnerLocalDate, type LedgerSession, type WeekCoverage } from '@/domain/planning/beginner5kRunnerEvidence';
import { compareBeginner5kStartingWorkload } from '@/domain/planning/beginner5kStartingWorkload';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { beginnerFoundationReference, previewBeginner5kWeek } from '@/domain/planning/beginner5kWeeklyDecision';
import { bundledMultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { researchBlock, researchConstraints, researchEvidence, successfulOutcomes } from '../support/researchFoundationFixtures';

const dates = ['2027-01-04','2027-01-11','2027-01-18','2027-01-25'];
function sessions(values = [2400,3000,3600,3000]): LedgerSession[] { return dates.map((date,i) => ({ id: `s${i}`, ownerId: 'account-a', activityId: `a${i}`, source: 'manual', localDate: date, timezone: 'Asia/Kolkata', episodeId: 'current', runningSeconds: values[i]!, walkingSeconds: 600, gpsElapsedSeconds: null, runningExplicit: true, status: 'completed', reliability: 'medium' })); }
function coverage(): WeekCoverage[] { return dates.map((date,i) => ({ ownerId: 'account-a', weekStart: date, timezone: 'Asia/Kolkata', episodeId: 'current', sourceId: `coverage${i}`, coverage: 'complete' })); }
function ledger(s = sessions(), c = coverage()) { return buildWeeklyEvidenceLedger({ ownerId: 'account-a', targetWeek: '2027-02-01', evaluatedOn: '2027-02-01', timezone: 'Asia/Kolkata', episodeId: 'current', interruption: false, sessions: s, coverage: c }); }
function evidence() { return normalizeBeginner5kEvidence({ ...emptyFitnessAssessmentDraft('account-a', 'Asia/Kolkata'), foundationEvidenceConfirmedAt: '2027-02-01', interruption: 'none' }, researchEvidence, { ...researchConstraints, goalFamily: '5k', startDate: '2027-02-01' }, '2027-02-01', null, []); }

test('four complete weeks calculate all candidates deterministically without selecting or changing a workout', () => {
  const e = evidence(); const original = previewBeginner5kWeek({ evidence: e, block: null, outcomes: [], week: 1, policyReference: beginnerFoundationReference }); e.weeklyLedger = ledger();
  const before = JSON.stringify(e); const result = compareBeginner5kStartingWorkload(e);
  expect(result.candidates.map(c => c.runningSeconds)).toEqual([3000,3000,3000]);
  expect(result).toEqual(compareBeginner5kStartingWorkload(e)); expect(JSON.stringify(e)).toBe(before);
  expect(result).toMatchObject({ prescriptionSelected: false, productionEligible: false, researchOnly: true });
  const next = previewBeginner5kWeek({ evidence: e, block: null, outcomes: [], week: 1, policyReference: beginnerFoundationReference });
  expect(next.workouts).toEqual(original.workouts); expect(next.fingerprint).not.toBe(original.fingerprint);
});
test('missing and partial weeks are not dropped or converted to zeros', () => {
  const e = evidence(); e.weeklyLedger = ledger(sessions().slice(1), coverage().slice(1));
  expect(e.weeklyLedger.weeks[0]).toMatchObject({ coverage: 'unknown', runningTotalSeconds: null });
  expect(compareBeginner5kStartingWorkload(e).candidates.map(c => c.available)).toEqual([true,false,false]);
  e.weeklyLedger = ledger(sessions(), coverage().slice(1));
  expect(e.weeklyLedger.weeks[0]).toMatchObject({ coverage: 'partial', runningSubtotalSeconds: 2400, runningTotalSeconds: null });
});
test('an explicit zero is valid evidence but never a fabricated prescription', () => {
  const c = coverage(); c[0]!.coverage = 'confirmed_no_running'; const e = evidence(); e.weeklyLedger = ledger(sessions().slice(1), c);
  expect(e.weeklyLedger.weeks[0]).toMatchObject({ coverage: 'confirmed_no_running', runningTotalSeconds: 0 });
  expect(compareBeginner5kStartingWorkload(e).candidates[1]!.runningSeconds).toBe(2400);
  e.weeklyLedger = ledger(sessions(), c); expect(e.weeklyLedger.weeks[0]!.issues).toContain('zero_week_conflicts_with_activity');
});
test('mean and median retain exact inputs and floor only final seconds', () => {
  const e = evidence(); e.weeklyLedger = ledger(sessions([101,102,103,104]));
  const r = compareBeginner5kStartingWorkload(e);
  expect(r.candidates.map(c => c.runningSeconds)).toEqual([3000,102,102]);
  expect(r.candidates[1]!.inputs).toMatchObject({ numerator:410, denominator:4, medianSeconds:102.5 });
  expect(r.findings).toContain('report_and_history_differ_not_automatically_contradictory');
});
test('self report does not assert observation dates or fabricate observed history', () => {
  const e = evidence(); expect(e.observations[0]).toMatchObject({ date:null, confirmationDate:'2027-02-01', window:{ start:null, end:null } });
  expect(compareBeginner5kStartingWorkload(e).candidates.map(c => c.available)).toEqual([true,false,false]);
  e.foundation.currentEvidenceConfirmed = false;
  expect(compareBeginner5kStartingWorkload(e).candidates.every(c => !c.available)).toBe(true);
});
test.each([40,60,100])('%i-day interruptions do not trigger invented detraining reductions', () => {
  const e = evidence(); e.foundation.context = 'returning_after_break'; e.foundation.demonstratedAfterBreak = false;
  e.weeklyLedger = { ...ledger(), interruption:true };
  expect(compareBeginner5kStartingWorkload(e).candidates.every(c => !c.available)).toBe(true);
  e.foundation.demonstratedAfterBreak = true; expect(compareBeginner5kStartingWorkload(e).candidates[0]!.runningSeconds).toBe(3000);
});
test('historical episodes remain excluded and incomparable', () => {
  const e = evidence(); e.weeklyLedger = ledger(sessions().map(s => ({...s,episodeId:'previous'})));
  expect(e.weeklyLedger.weeks[0]!.excluded[0]!.reason).toBe('historical_training_episode');
  expect(compareBeginner5kStartingWorkload(e).candidates[1]!.available).toBe(false);
});
test('explicit episode dates separate current from historical evidence without inferring a boundary',()=>{
  const classified=classifyLedgerSessionsByEpisode(sessions(),{id:'current-training-episode',status:'current',startedOn:'2027-01-18'},'Asia/Kolkata');
  expect(classified.slice(0,2).every(item=>item.episodeId==='historical-before:current-training-episode')).toBe(true);
  expect(classified.slice(2).every(item=>item.episodeId==='current-training-episode')).toBe(true);
  expect(classifyLedgerSessionsByEpisode(sessions(),{id:'current-training-episode',status:'unknown',startedOn:null},'Asia/Kolkata').every(item=>item.episodeId===null)).toBe(true);
});
test('linked GPS and outcome count once; conflicting associations block observed totals', () => {
  const s = sessions(); s[0]!.source = 'research_outcome';
  const gps: LedgerSession = {...s[0]!,id:'gps',source:'gps',runningExplicit:false,runningSeconds:null,gpsElapsedSeconds:3000};
  const l = ledger([...s,gps]); expect(l.weeks[0]!.sessionCount).toBe(1); expect(l.weeks[0]!.runningTotalSeconds).toBe(2400);
  expect(l.weeks[0]!.gpsElapsedSubtotalSeconds).toBe(3000);
  expect(l.excluded[0]!.reason).toContain('linked_activity_counted_once');
  expect(ledger([...s,{...s[0]!,id:'duplicate'}]).issues).toContain('duplicate_activity_association');
});
test('corrections preserve lineage; unreported and GPS timing cannot become running evidence', () => {
  const history = successfulOutcomes(researchBlock()); const old = history[0]!;
  history.push({...old,id:'correction',previousVersionId:old.id,record:{...old.record,actualRunningSeconds:500}});
  const projected = researchLedgerSessions('account-a','Asia/Kolkata',history);
  expect(projected.sessions.find(s => s.id === old.id)).toBeUndefined(); expect(projected.sessions.find(s => s.id === 'correction')!.runningSeconds).toBe(500);
  expect(projected.lineage.find(l => l.id === old.id)!.current).toBe(false);
  const s = sessions(); s[0] = {...s[0]!,runningExplicit:false,gpsElapsedSeconds:2400};
  expect(ledger(s).weeks[0]!.runningTotalSeconds).toBeNull();
  s[0]!.status='unreported'; expect(ledger(s).weeks[0]!.issues).toContain('unreported_outcome');
});
test('runner-local dates and DST boundaries use calendar weeks', () => {
  expect(runnerLocalDate('2027-01-03T20:00:00Z','Asia/Kolkata')).toBe('2027-01-04');
  expect(runnerLocalDate('2027-01-04T01:00:00Z','America/New_York')).toBe('2027-01-03');
  const l = buildWeeklyEvidenceLedger({ownerId:'account-a',targetWeek:'2027-03-15',evaluatedOn:'2027-03-15',timezone:'America/New_York',episodeId:null,interruption:false,sessions:[],coverage:[]});
  expect(l.weeks[3]).toMatchObject({start:'2027-03-08',end:'2027-03-14'});
});
test('two days, time limits, circular recovery and repeatability are distinct compatibility findings', () => {
  const e = evidence(); e.foundation.requestedFrequency = 2; e.constraints.availableDays = [3,5].map(weekday=>({weekday,maxMinutes:40,confirmedByRunner:true}));
  let c = compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!; expect(c.modeledSessions).toHaveLength(2); expect(c.scheduleDates).toHaveLength(2);
  e.constraints.availableDays = [0,6].map(weekday=>({weekday,maxMinutes:40,confirmedByRunner:true}));
  expect(compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!.status).toBe('conflict');
  e.constraints.availableDays = [3,5].map(weekday=>({weekday,maxMinutes:10,confirmedByRunner:true}));
  expect(compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!.findings).toContain('session_exceeds_time_limit');
  e.constraints.availableDays = [3,5].map(weekday=>({weekday,maxMinutes:60,confirmedByRunner:true})); e.foundation.context='first_time_runner'; e.foundation.currentContinuousRunningSeconds=60; e.foundation.currentWeeklyRunningSeconds=600;
  c=compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!; expect(c.findings).toContain('repeatable_bout_evidence_and_compatibility_rule_required'); expect(c.modeledSessions[0]).toMatchObject({runningSeconds:300,walkingSeconds:840,totalSeconds:1140,bouts:5});
});
test('ownership, stale context, health and exact proposal authorization remain enforced', () => {
  const e = evidence(); e.weeklyLedger = ledger([{...sessions()[0]!,ownerId:'other'}]);
  expect(compareBeginner5kStartingWorkload(e).candidates.every(c=>!c.available)).toBe(true);
  e.weeklyLedger=ledger(); e.weeklyLedger.evaluatedOn='2027-02-02'; expect(compareBeginner5kStartingWorkload(e).candidates[0]!.reasons).toContain('ledger_context_mismatch');
  expect(compareBeginner5kStartingWorkload(e,'wrong@version').candidates[0]!.reasons).toContain('comparison_policy_version_unavailable');
  e.weeklyLedger=ledger(); e.foundation.healthConcern=true; expect(compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!.findings).toContain('health_hold');
  expect(bundledMultiDistancePolicyRegistry.resolve('torto.foundation.starting_workload_comparison','0.1.0-draft','5k',true).kind).toBe('unavailable');
});

test('observed previous Sunday prevents a Monday allocation and known bouts remain unreviewed', () => {
  const e = evidence(); e.foundation.requestedFrequency=2;
  e.constraints.availableDays=[0,3].map(weekday=>({weekday,maxMinutes:45,confirmedByRunner:true}));
  const s=sessions(); s[3]!.localDate='2027-01-31'; e.weeklyLedger=ledger(s);
  expect(compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!.status).toBe('conflict');
  e.constraints.availableDays=[1,3].map(weekday=>({weekday,maxMinutes:45,confirmedByRunner:true}));
  e.foundation.context='first_time_runner'; e.foundation.currentContinuousRunningSeconds=60; e.foundation.currentWeeklyRunningSeconds=600;
  s[0]={...s[0]!,runningSeconds:300,reportedBouts:{sourceId:'explicit-bouts',runningSeconds:[60,60,60,60,60],walkingRecoverySeconds:[60,60,60,60]}}; e.weeklyLedger=ledger(s);
  expect(compareBeginner5kStartingWorkload(e).candidates[0]!.compatibility!.findings).toContain('repeatable_bout_evidence_present_compatibility_rule_unreviewed');
});

test('wrong windows, future confirmation, noninteger durations and incomplete episode coverage are unavailable', () => {
  const e=evidence(); e.confirmedAt='2027-02-02'; expect(compareBeginner5kStartingWorkload(e).candidates[0]!.available).toBe(false);
  e.confirmedAt='2027-02-01'; e.weeklyLedger=ledger(); e.weeklyLedger.weeks[0]!.end='2027-01-09';
  expect(compareBeginner5kStartingWorkload(e).candidates[1]!.reasons).toContain('noncomparable_week_windows');
  const s=sessions(); s[0]!.runningSeconds=1.5; e.weeklyLedger=ledger(s); expect(compareBeginner5kStartingWorkload(e).candidates[1]!.reasons).toContain('invalid_duration');
  e.weeklyLedger=ledger(); e.weeklyLedger.episodeId=null; expect(compareBeginner5kStartingWorkload(e).candidates[1]!.reasons).toContain('current_uninterrupted_episode_required');
});

test('historical exclusions and legacy timezone uncertainty remain auditable', () => {
  const old = {...sessions()[0]!,id:'old',activityId:'old',localDate:'2026-01-01'};
  expect(ledger([...sessions(),old]).excluded).toContainEqual({id:'old',reason:'outside_candidate_observation_windows'});
  const s=sessions(); s[0]!.timezoneVerified=false;
  expect(ledger(s).weeks[0]!.issues).toContain('historical_observation_timezone_unrecorded');
  expect(ledger(s).weeks[0]!.runningSubtotalSeconds).toBe(2400);
  expect(ledger(s).weeks[0]!.runningTotalSeconds).toBeNull();
});
