import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { MemoryDatabase } from '../support/memoryDatabase';
import { researchBlock, successfulOutcomes } from '../support/researchFoundationFixtures';
import { describeResearchBlock } from '@/domain/planning/researchFoundation';

test('idempotent creation, reload, corrections, stale conflict and account isolation',async()=>{
  const db=new MemoryDatabase();const a=new ResearchFoundationRepository(db,'account-a');const b=researchBlock();
  const saved=await Promise.all([a.saveBlock(b),a.saveBlock({...b,id:'other-id',assignments:b.assignments.map(x=>({...x,assignmentId:x.assignmentId.replace(b.id,'other-id'),logicalSessionId:x.logicalSessionId.replace(b.id,'other-id'),planId:'other-id',revisionId:'other-id'}))})]);
  expect(saved[0].id).toBe(saved[1].id);expect(await a.blocks()).toHaveLength(1);
  const row=successfulOutcomes(b)[0];await a.saveOutcome(row);await a.saveOutcome(row);
  const correction={...row,id:'corrected',previousVersionId:row.id};await a.saveOutcome(correction);
  await expect(a.saveOutcome({...correction,id:'fork'})).rejects.toThrow('stale_outcome_correction');
  expect(describeResearchBlock(b,await a.outcomes(b.id)).filter(x=>x.status==='completed')).toHaveLength(1);
  await a.saveOutcome({...correction,id:'removed',previousVersionId:correction.id,removed:true});
  expect(describeResearchBlock(b,await a.outcomes(b.id))[0].status).toBe('unreported');
  const reloaded=new ResearchFoundationRepository(db,'account-a');expect(await reloaded.outcomes(b.id)).toHaveLength(3);
  const other=new ResearchFoundationRepository(db,'account-b');expect(await other.blocks()).toEqual([]);await expect(other.outcomes(b.id)).rejects.toThrow('not_owned');
  expect(db.statements.filter(s=>s.startsWith('INSERT')).every(s=>s.includes('research_foundation_'))).toBe(true);
});
test('wrong-account activity cannot be associated; partial transaction fails without outcome',async()=>{
  const db=new MemoryDatabase();const r=new ResearchFoundationRepository(db,'account-a');const b=researchBlock();await r.saveBlock(b);
  await db.run('INSERT INTO activity_logs (id, owner_id) VALUES (?, ?)', ['foreign','account-b']);
  const row={...successfulOutcomes(b)[0],associatedActivityId:'foreign'};
  await expect(r.saveOutcome(row)).rejects.toThrow('activity_not_owned');expect(await r.outcomes(b.id)).toEqual([]);
  db.failOn='INSERT INTO research_foundation_outcomes';await expect(r.saveOutcome({...row,associatedActivityId:null})).rejects.toThrow('Injected');
  expect(await r.outcomes(b.id)).toEqual([]);
});
