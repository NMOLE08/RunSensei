import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { buildWeeklyEvidenceLedger, normalizeBeginner5kEvidence, type LedgerSession, type WeekCoverage } from '@/domain/planning/beginner5kRunnerEvidence';
import { evaluateBeginner5kPolicyReadiness } from '@/domain/planning/beginner5kPolicyReadiness';
import { compareBeginner5kStartingWorkload, startingWorkloadProposalReference } from '@/domain/planning/beginner5kStartingWorkload';
import { beginnerFoundationReference, previewBeginner5kWeek } from '@/domain/planning/beginner5kWeeklyDecision';
import { researchConstraints, researchEvidence } from '../support/researchFoundationFixtures';

const dates=['2027-01-04','2027-01-11','2027-01-18','2027-01-25'];
function sessions(values=[3000,3000,3000,3000]):LedgerSession[]{return dates.map((date,index)=>({id:`session-${index}`,ownerId:'account-a',activityId:`activity-${index}`,source:'manual',localDate:date,timezone:'Asia/Kolkata',episodeId:'current-training-episode',runningSeconds:values[index]!,walkingSeconds:null,gpsElapsedSeconds:null,runningExplicit:true,status:'completed',reliability:'high'}));}
function coverage(states:WeekCoverage['coverage'][]=['complete','complete','complete','complete']):WeekCoverage[]{return dates.map((date,index)=>({ownerId:'account-a',weekStart:date,timezone:'Asia/Kolkata',episodeId:'current-training-episode',sourceId:`coverage-${index}`,coverage:states[index]!}));}
function evidence(){
  const draft={...emptyFitnessAssessmentDraft('account-a','Asia/Kolkata'),goal:'5k' as const,weeklyMinutes:'50',comfortableRunMinutes:'45',foundationEvidenceConfirmedAt:'2027-02-01',interruption:'none' as const};
  const result=normalizeBeginner5kEvidence(draft,researchEvidence,{...researchConstraints,ownerId:'account-a',goalFamily:'5k',startDate:'2027-02-01'},'2027-02-01',null,[]);
  result.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:'account-a',targetWeek:'2027-02-01',evaluatedOn:'2027-02-01',timezone:'Asia/Kolkata',episodeId:'current-training-episode',interruption:false,sessions:sessions(),coverage:coverage()});
  return result;
}
function readiness(e=evidence(),revision={weeklyConfirmations:dates.map((date,index)=>`${date}:1:complete:coverage-${index}`),trainingEpisode:'current-training-episode:1:current:2027-01-01'}){
  const comparison=compareBeginner5kStartingWorkload(e);
  return evaluateBeginner5kPolicyReadiness({evidence:e,comparison,evidenceFingerprint:'fingerprint-1',revisionIdentity:revision,policyReferences:[beginnerFoundationReference,startingWorkloadProposalReference]});
}

test('four complete current-episode weeks make all calculations available without authorizing a prescription',()=>{
  const result=readiness();
  expect(result.calculations.map(item=>item.calculationAvailable)).toEqual([true,true,true]);
  expect(result.calculations.map(item=>item.calculatedRunningSeconds)).toEqual([3000,3000,3000]);
  expect(result.prescriptionAuthorized).toBe(false); expect(result.productionEligible).toBe(false);
  expect(result.sessionCompatibility.every(item=>item.modeledSessions.length===3)).toBe(true);
});

test('partial and unknown weeks identify exact missing observation windows',()=>{
  const e=evidence(); e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:'current-training-episode',interruption:false,sessions:sessions(),coverage:coverage(['complete','partial','unknown','complete'])});
  const result=readiness(e);
  expect(result.calculations.find(item=>item.method==='confirmed_report')!.calculationAvailable).toBe(true);
  const observed=result.calculations.find(item=>item.method==='observed_mean')!;
  expect(observed.calculationAvailable).toBe(false); expect(observed.requiredEvidence.join(' ')).toContain('Week 2'); expect(observed.requiredEvidence.join(' ')).toContain('Week 3');
});

test('confirmed zero is valid while unknown remains missing evidence',()=>{
  const e=evidence(); const zeroSessions=sessions().slice(1);
  e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:'current-training-episode',interruption:false,sessions:zeroSessions,coverage:coverage(['confirmed_no_running','complete','complete','complete'])});
  expect(readiness(e).calculations.find(item=>item.method==='observed_mean')!.calculatedRunningSeconds).toBe(2250);
  e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:'current-training-episode',interruption:false,sessions:zeroSessions,coverage:coverage(['unknown','complete','complete','complete'])});
  expect(readiness(e).calculations.find(item=>item.method==='observed_mean')!.calculationAvailable).toBe(false);
});

test('self-report-only evidence stays descriptive and does not become observed history',()=>{
  const e=evidence(); e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:'current-training-episode',interruption:false,sessions:[],coverage:[]});
  const result=readiness(e);
  expect(result.calculations.find(item=>item.method==='confirmed_report')).toMatchObject({calculationAvailable:true,calculatedRunningSeconds:3000,prescriptionAuthorized:false});
  expect(result.calculations.find(item=>item.method==='observed_mean')!.calculationAvailable).toBe(false);
});

test('different self-report and observed history are retained as disagreement rather than silently resolved',()=>{
  const e=evidence(); e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:'current-training-episode',interruption:false,sessions:sessions([1200,1200,1200,1200]),coverage:coverage()});
  const result=readiness(e);
  expect(result.calculations.find(item=>item.method==='confirmed_report')!.calculatedRunningSeconds).toBe(3000);
  expect(result.calculations.find(item=>item.method==='observed_mean')!.calculatedRunningSeconds).toBe(1200);
  expect(result.reasonCodes).toContain('report_and_history_differ_not_automatically_contradictory');
});

test('historical-only or unknown episodes do not support observed calculations',()=>{
  const e=evidence(); e.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:e.ownerId,targetWeek:e.constraints.startDate,evaluatedOn:e.evaluatedOn,timezone:e.timezone,episodeId:null,interruption:false,sessions:sessions().map(item=>({...item,episodeId:'historical-before:current-training-episode'})),coverage:[]});
  const result=readiness(e,{weeklyConfirmations:[],trainingEpisode:'current-training-episode:2:unknown:unknown'});
  expect(result.overallStatus).toBe('episode_uncertain'); expect(result.trainingEpisode.status).toBe('unknown');
  expect(result.calculations.find(item=>item.method==='observed_mean')!.calculationAvailable).toBe(false);
});

test('interruption and health precedence override available descriptive calculations',()=>{
  const interrupted=evidence(); interrupted.interruption=true; interrupted.weeklyLedger={...interrupted.weeklyLedger!,interruption:true};
  expect(readiness(interrupted).overallStatus).toBe('episode_uncertain');
  interrupted.foundation.healthConcern=true;
  expect(readiness(interrupted).overallStatus).toBe('health_hold');
});

test('current feedback signals are preserved without inventing a workload response',()=>{
  const e=evidence(); const comparison=compareBeginner5kStartingWorkload(e);
  const fatigue=evaluateBeginner5kPolicyReadiness({evidence:e,comparison,evidenceFingerprint:'feedback',policyReferences:[beginnerFoundationReference,startingWorkloadProposalReference],performanceSignals:[{evidenceId:'outcome-current',status:'completed',difficulty:'comfortable',fatigue:'unusual',discomfort:'none'}]});
  expect(fatigue.overallStatus).toBe('health_hold'); expect(fatigue.reasonCodes).toContain('unusual_fatigue_requires_review'); expect(fatigue.calculations[0]!.evidenceIdsUsed).toContain('outcome-current');
  const difficult=evaluateBeginner5kPolicyReadiness({evidence:e,comparison,evidenceFingerprint:'feedback',policyReferences:[beginnerFoundationReference,startingWorkloadProposalReference],performanceSignals:[{evidenceId:'outcome-current',status:'completed',difficulty:'too_difficult',fatigue:'none',discomfort:'none'}]});
  expect(difficult.overallStatus).toBe('policy_authorization_missing'); expect(difficult.prescriptionAuthorized).toBe(false);
});

test('continuous capacity does not establish repeatable run-walk bouts',()=>{
  const e=evidence(); e.foundation.context='first_time_runner'; e.foundation.currentWeeklyRunningSeconds=600; e.foundation.currentContinuousRunningSeconds=60;
  const result=readiness(e);
  const session=result.sessionCompatibility.find(item=>item.method==='confirmed_report')!;
  expect(session.repeatabilityStatus).toBe('missing'); expect(session.requiredEvidence).toContain('Explicit repeatable run/walk bout evidence');
});

test('schedule limits, contradictory zero evidence and ownership failures remain explicit',()=>{
  const limited=evidence(); limited.constraints.availableDays=limited.constraints.availableDays.map(day=>({...day,maxMinutes:5}));
  expect(readiness(limited).sessionCompatibility.find(item=>item.method==='confirmed_report')!.reasonCodes).toContain('session_exceeds_time_limit');
  const contradictory=evidence(); contradictory.weeklyLedger=buildWeeklyEvidenceLedger({ownerId:contradictory.ownerId,targetWeek:contradictory.constraints.startDate,evaluatedOn:contradictory.evaluatedOn,timezone:contradictory.timezone,episodeId:'current-training-episode',interruption:false,sessions:sessions(),coverage:coverage(['confirmed_no_running','complete','complete','complete'])});
  expect(readiness(contradictory).overallStatus).toBe('integrity_conflict');
  const wrong=evidence(); wrong.constraints={...wrong.constraints,ownerId:'account-b'};
  expect(readiness(wrong).overallStatus).toBe('integrity_conflict');
});

test('outputs are deterministic, fingerprinted, revision-aware and do not change foundation generation',()=>{
  const e=evidence(); const before=previewBeginner5kWeek({evidence:e,block:null,outcomes:[],week:1,policyReference:beginnerFoundationReference});
  const first=readiness(e); expect(readiness(e)).toEqual(first); expect(first.evidenceFingerprint).toBe('fingerprint-1');
  const revised=readiness(e,{weeklyConfirmations:['2027-01-04:2:partial:new-source'],trainingEpisode:'current-training-episode:2:current:2027-01-08'});
  expect(revised.revisionIdentity).not.toEqual(first.revisionIdentity); expect(revised.trainingEpisode).toMatchObject({revision:2,startedOn:'2027-01-08'});
  const after=previewBeginner5kWeek({evidence:e,block:null,outcomes:[],week:1,policyReference:beginnerFoundationReference});
  expect(after.workouts).toEqual(before.workouts); expect(first.calculations.every(item=>!item.prescriptionAuthorized)).toBe(true);
});
