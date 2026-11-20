import { describeResearchBlock, reassessResearchFoundation, snapshotResearchBlock } from '@/domain/planning/researchFoundation';
import { researchBlock, researchEvidence, researchConstraints, successfulOutcomes, nextResearchInput } from '../support/researchFoundationFixtures';

test('complete low-volume block recalculates from confirmed capacity without automatic workload increase', () => {
  const b = researchBlock(); const history = successfulOutcomes(b); const before = JSON.stringify(b);
  const result = reassessResearchFoundation(b, history, nextResearchInput);
  expect(result).toMatchObject({ kind: 'next_block', transition: 'continue_foundation', researchOnly: true, productionEligible: false });
  expect(result.nextProgram?.workouts).toHaveLength(12);
  expect(result.nextProgram?.workouts[0].target).toEqual({ kind: 'duration_seconds', value: 1600 });
  expect(result.nextProgram?.validation.valid).toBe(true); expect(JSON.stringify(b)).toBe(before);
  expect(result.evidenceIds).toHaveLength(12);
});
test.each(['first_time_runner', 'returning_after_break'] as const)('%s transitions from intervals only with fresh demonstrated continuous ability', context => {
  const b = researchBlock({ ...researchEvidence, context, currentWeeklyRunningSeconds: 300, currentContinuousRunningSeconds: 30 });
  const r = reassessResearchFoundation(b, successfulOutcomes(b), { ...nextResearchInput, evidence: { ...researchEvidence, context: 'currently_training', currentWeeklyRunningSeconds: 300, currentContinuousRunningSeconds: 600 } });
  expect(r).toMatchObject({ kind: 'next_block', transition: 'walk_run_to_continuous_foundation' });
  expect(r.nextProgram?.workouts.every(w => !w.steps.some(s => s.kind === 'recovery'))).toBe(true);
});
test('unreported is not missed and elapsed weeks do not authorize progression', () => {
  const b = researchBlock(); const rows = successfulOutcomes(b).slice(1);
  expect(describeResearchBlock(b, rows)[0].status).toBe('unreported');
  expect(reassessResearchFoundation(b, rows, nextResearchInput)).toMatchObject({ kind: 'insufficient_evidence', reasonCodes: ['unreported_workouts'] });
});
test.each(['partial', 'missed', 'different_activity'] as const)('%s does not generate a repeat or invent a reduction', status => {
  const b = researchBlock(); const rows = successfulOutcomes(b); rows[0].record.status = status;
  if (status === 'missed') Object.assign(rows[0].record, {actualDurationSeconds:null,actualRunningSeconds:null});
  expect(reassessResearchFoundation(b, rows, nextResearchInput).kind).toBe('policy_gap');
});
test('correction counted once; removed outcome is unreported but historical pain persists', () => {
  const b = researchBlock(); const rows = successfulOutcomes(b);
  const corrected = { ...rows[0], id:'correction', previousVersionId:rows[0].id };
  expect(describeResearchBlock(b, [...rows, corrected]).filter(r => r.status === 'completed')).toHaveLength(12);
  expect(describeResearchBlock(b, [...rows, {...corrected, removed:true}])[0].status).toBe('unreported');
  rows[0].record = {...rows[0].record,discomfort:'pain_or_injury_concern'};
  expect(reassessResearchFoundation(b, [...rows, {...corrected,removed:true}], nextResearchInput)).toMatchObject({kind:'hold_for_review',healthHold:true});
});
test.each(['fatigue', 'missing_running', 'unconfirmed', 'interrupted', 'stale', 'future', 'capacity_unknown'] as const)('blocks %s without inventing evidence', scenario => {
  const b=researchBlock();const rows=successfulOutcomes(b);const input=structuredClone(nextResearchInput);
  if(scenario==='fatigue') rows[0].record.fatigue='unusual';
  if(scenario==='missing_running') rows[0].record.actualRunningSeconds=null;
  if(scenario==='unconfirmed') input.evidence.currentEvidenceConfirmed=false;
  if(scenario==='interrupted') input.interruption=true;
  if(scenario==='stale') input.confirmedAt='2027-01-04';
  if(scenario==='future') rows[0].record.actualDate='2028-01-01';
  if(scenario==='capacity_unknown') input.evidence.currentWeeklyRunningSeconds=null;
  expect(reassessResearchFoundation(b,rows,input).nextProgram).toBeNull();
});
test('preserves two real days and rejects a next-block time limit conflict',()=>{
  const e={...researchEvidence,requestedFrequency:2};const c={...researchConstraints,availableDays:[3,5].map(weekday=>({weekday,maxMinutes:45,confirmedByRunner:true}))};
  const b=researchBlock(e,c);const result=reassessResearchFoundation(b,successfulOutcomes(b),{...nextResearchInput,evidence:e,constraints:{...c,startDate:'2027-02-01'}});
  expect(result.nextProgram?.workouts).toHaveLength(8);
  const blocked=reassessResearchFoundation(b,successfulOutcomes(b),{...nextResearchInput,evidence:e,constraints:{...c,startDate:'2027-02-01',availableDays:c.availableDays.map(d=>({...d,maxMinutes:1}))}});
  expect(blocked.kind).toBe('policy_gap');
});
test('rejects unknown historical versions and altered steps',()=>{
  const b=researchBlock();const edited=structuredClone(b);edited.program.policyReference='unknown@1';
  expect(reassessResearchFoundation(edited,successfulOutcomes(b),nextResearchInput).kind).toBe('policy_gap');
  expect(()=>snapshotResearchBlock(edited)).toThrow();
});
test('actual training without required rest and cross-block recovery both require review',()=>{
  const b=researchBlock();const rows=successfulOutcomes(b);rows[1].record.actualDate=rows[0].record.actualDate;
  expect(reassessResearchFoundation(b,rows,nextResearchInput).reasonCodes).toEqual(['actual_recovery_spacing_requires_review']);
  const result=reassessResearchFoundation(b,successfulOutcomes(b),{...nextResearchInput,constraints:{...nextResearchInput.constraints,availableDays:[0,2,4].map(weekday=>({weekday,maxMinutes:45,confirmedByRunner:true}))}});
  expect(result.reasonCodes).toEqual(['cross_block_recovery_spacing']);
});
test('invalid outcome lineage is held before progression',()=>{
  const b=researchBlock();const rows=successfulOutcomes(b);rows[0].record.revisionId='foreign-revision';
  expect(reassessResearchFoundation(b,rows,nextResearchInput).reasonCodes).toEqual(['invalid_outcome_lineage']);
});
test('fixed goal cannot silently be moved to accommodate another foundation block',()=>{
  const b=researchBlock();const result=reassessResearchFoundation(b,successfulOutcomes(b),{...nextResearchInput,constraints:{...nextResearchInput.constraints,fixedGoalDate:'2027-02-15'}});
  expect(result.reasonCodes).toContain('foundation_goal_date_conflict');expect(result.nextProgram).toBeNull();
});
