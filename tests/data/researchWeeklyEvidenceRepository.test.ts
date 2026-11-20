import { CURRENT_TRAINING_EPISODE_ID, ResearchWeeklyEvidenceRepository } from '@/data/researchWeeklyEvidenceRepository';
import { MemoryDatabase } from '../support/memoryDatabase';

const base = { ownerId:'account-a',weekStart:'2027-01-04',observationEnd:'2027-01-10',timezone:'Asia/Kolkata',episodeId:null,sourceId:'confirm:1',confirmedAt:'2027-02-01T10:00:00Z' };

test('coverage revisions persist, reload, and unknown withdrawal preserves history',async()=>{
  const db=new MemoryDatabase(); const repository=new ResearchWeeklyEvidenceRepository(db,'account-a');
  expect((await repository.save({...base,coverage:'complete'},0)).revision).toBe(1);
  expect((await repository.save({...base,sourceId:'confirm:2',coverage:'partial'},1)).revision).toBe(2);
  expect((await repository.save({...base,sourceId:'confirm:3',coverage:'unknown'},2)).revision).toBe(3);
  expect((await repository.weeks())[0]).toMatchObject({coverage:'unknown',revision:3});
  expect((await repository.weekHistory(base.weekStart)).map(item=>item.coverage)).toEqual(['complete','partial','unknown']);
});

test('confirmed zero is persisted distinctly from unknown and stale revisions are rejected',async()=>{
  const repository=new ResearchWeeklyEvidenceRepository(new MemoryDatabase(),'account-a');
  await repository.save({...base,coverage:'confirmed_no_running'},0);
  expect((await repository.weeks())[0]!.coverage).toBe('confirmed_no_running');
  await expect(repository.save({...base,sourceId:'stale',coverage:'unknown'},0)).rejects.toThrow('stale_weekly_evidence_revision');
});

test('owner-scoped records remain isolated',async()=>{
  const db=new MemoryDatabase(); const a=new ResearchWeeklyEvidenceRepository(db,'account-a'); const b=new ResearchWeeklyEvidenceRepository(db,'account-b');
  await a.save({...base,coverage:'complete'},0);
  await b.save({...base,ownerId:'account-b',sourceId:'b:1',coverage:'partial'},0);
  expect((await a.weeks()).map(item=>item.coverage)).toEqual(['complete']);
  expect((await b.weeks()).map(item=>item.coverage)).toEqual(['partial']);
  await expect(a.save({...base,ownerId:'account-b',coverage:'unknown'},1)).rejects.toThrow('research_owner_mismatch');
});

test('training episode corrections and unknown withdrawal are append-only',async()=>{
  const db=new MemoryDatabase(); const repository=new ResearchWeeklyEvidenceRepository(db,'account-a');
  const first=await repository.saveEpisode({id:CURRENT_TRAINING_EPISODE_ID,ownerId:'account-a',status:'current',startedOn:'2027-01-01',interruptionDate:null,reason:null,timezone:'Asia/Kolkata'},0);
  const corrected=await repository.saveEpisode({...first,startedOn:'2027-01-08'},1);
  const withdrawn=await repository.saveEpisode({...corrected,status:'unknown',startedOn:null},2);
  expect(withdrawn).toMatchObject({revision:3,status:'unknown',startedOn:null,timezone:'Asia/Kolkata'});
  expect(await repository.episode()).toEqual(withdrawn);
  expect(db.table('research_training_episodes')).toHaveLength(3);
});

test('training episode revisions reject stale and cross-account writes',async()=>{
  const db=new MemoryDatabase(); const a=new ResearchWeeklyEvidenceRepository(db,'account-a'); const b=new ResearchWeeklyEvidenceRepository(db,'account-b');
  const episode={id:CURRENT_TRAINING_EPISODE_ID,ownerId:'account-a',status:'current' as const,startedOn:'2027-01-01',interruptionDate:null,reason:null,timezone:'UTC'};
  await a.saveEpisode(episode,0);
  await expect(a.saveEpisode({...episode,startedOn:'2027-01-02'},0)).rejects.toThrow('stale_episode_revision');
  await expect(a.saveEpisode({...episode,ownerId:'account-b'},1)).rejects.toThrow('research_owner_mismatch');
  expect(await b.episode()).toBeNull();
});
