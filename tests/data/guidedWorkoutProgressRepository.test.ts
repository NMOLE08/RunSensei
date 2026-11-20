import { GuidedWorkoutProgressRepository } from '@/data/guidedWorkoutProgressRepository';
import { MemoryDatabase } from '../support/memoryDatabase';
import type { SqlValue } from '@/data/database';
import type { GuidedProgressRecord } from '@/data/guidedWorkoutProgressRepository';
import { initialGuidedProgress } from '@/domain/tracking/guidedWorkout';

class GuidedDatabase extends MemoryDatabase {
  override async getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    if (sql.includes('FROM research_guided_progress')) {
      const rows = this.table('research_guided_progress');
      const row = sql.includes('assignment_id = ?')
        ? rows.find(value => value.owner_id === params[0] && value.block_id === params[1] && value.assignment_id === params[2])
        : rows.find(value => value.owner_id === params[0] && value.tracking_session_id === params[1]);
      return (row as T | undefined) ?? null;
    }
    return super.getFirst<T>(sql, params);
  }
  override async run(sql: string, params: SqlValue[] = []) {
    if (sql.startsWith('INSERT INTO research_guided_progress')) {
      const columns = ['id','owner_id','block_id','assignment_id','tracking_session_id','snapshot_fingerprint','revision','progress_json','updated_at'];
      const row = Object.fromEntries(columns.map((column,index)=>[column,params[index]]));
      const rows = this.table('research_guided_progress');
      if (rows.some(item => item.owner_id === row.owner_id && item.block_id === row.block_id && item.assignment_id === row.assignment_id)) throw new Error('duplicate assignment progress');
      if (rows.some(item => item.owner_id === row.owner_id && item.tracking_session_id === row.tracking_session_id)) throw new Error('duplicate guided session');
      return super.run(sql, params);
    }
    if (sql.startsWith('UPDATE research_guided_progress')) {
      const [progress_json,revision,updated_at,id,owner_id,expected] = params;
      const row = this.table('research_guided_progress').find(value=>value.id===id&&value.owner_id===owner_id&&value.revision===expected);
      if (!row) return { changes: 0, lastInsertRowId: 0 };
      Object.assign(row,{progress_json,revision,updated_at}); return { changes: 1, lastInsertRowId: 0 };
    }
    return super.run(sql,params);
  }
}
const draft = (overrides: Partial<Omit<GuidedProgressRecord,'revision'>> = {}): Omit<GuidedProgressRecord,'revision'> => ({ id:'guided-a',ownerId:'account-a',blockId:'block-a',assignmentId:'block-a:w1:A',trackingSessionId:'track-a',snapshotFingerprint:'fingerprint-a',progress:initialGuidedProgress(),updatedAt:'2027-01-01T00:00:00Z',...overrides });

test('guided progress is account scoped, restart readable, idempotent and compare-and-swap protected',async()=>{
  const db=new GuidedDatabase();const repository=new GuidedWorkoutProgressRepository(db,'account-a');
  const first=await repository.create(draft());expect(first.revision).toBe(0);
  expect(await repository.create(draft())).toEqual(first);
  const resumed={...first.progress,status:'paused' as const};
  const saved=await repository.compareAndSwap(first.revision,{...draft(),progress:resumed,updatedAt:'2027-01-01T00:01:00Z'});
  expect(saved.revision).toBe(1);expect(saved.progress.status).toBe('paused');
  const stale=await repository.compareAndSwap(0,{...draft(),progress:initialGuidedProgress()});expect(stale).toEqual(saved);
  expect(await new GuidedWorkoutProgressRepository(db,'account-a').get(draft().blockId,draft().assignmentId)).toEqual(saved);
  expect(await new GuidedWorkoutProgressRepository(db,'account-b').get(draft().blockId,draft().assignmentId)).toBeNull();
  await expect(repository.create(draft({id:'other',trackingSessionId:'track-b'}))).rejects.toThrow('guided_progress_identity_conflict');
});
