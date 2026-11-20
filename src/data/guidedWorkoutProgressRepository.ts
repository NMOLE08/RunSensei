import type { SqlDatabase } from './database';
import type { GuidedProgress } from '@/domain/tracking/guidedWorkout';

export type GuidedProgressRecord = {
  id: string; ownerId: string; blockId: string; assignmentId: string; trackingSessionId: string;
  snapshotFingerprint: string; revision: number; progress: GuidedProgress; updatedAt: string;
};
type Stored = { id: string; owner_id: string; block_id: string; assignment_id: string; tracking_session_id: string; snapshot_fingerprint: string; revision: number; progress_json: string; updated_at: string };

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> { const next = queue.then(fn); queue = next.catch(() => undefined); return next; }
const decode = (row: Stored | null): GuidedProgressRecord | null => row ? ({ id: row.id, ownerId: row.owner_id, blockId: row.block_id, assignmentId: row.assignment_id, trackingSessionId: row.tracking_session_id, snapshotFingerprint: row.snapshot_fingerprint, revision: row.revision, progress: JSON.parse(row.progress_json) as GuidedProgress, updatedAt: row.updated_at }) : null;

/** Owner-scoped, compare-and-swap progress storage. Authored assignment data is never updated here. */
export class GuidedWorkoutProgressRepository {
  constructor(private readonly db: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('guided_owner_required'); }
  async get(blockId: string, assignmentId: string): Promise<GuidedProgressRecord | null> {
    return decode(await this.db.getFirst<Stored>('SELECT * FROM research_guided_progress WHERE owner_id = ? AND block_id = ? AND assignment_id = ?', [this.ownerId, blockId, assignmentId]));
  }
  async getBySession(sessionId: string): Promise<GuidedProgressRecord | null> {
    return decode(await this.db.getFirst<Stored>('SELECT * FROM research_guided_progress WHERE owner_id = ? AND tracking_session_id = ?', [this.ownerId, sessionId]));
  }
  async create(value: Omit<GuidedProgressRecord, 'revision'>): Promise<GuidedProgressRecord> {
    return serialize(() => this.db.transaction(async () => {
      const existing = await this.get(value.blockId, value.assignmentId);
      if (existing) {
        if (existing.trackingSessionId !== value.trackingSessionId || existing.snapshotFingerprint !== value.snapshotFingerprint) throw new Error('guided_progress_identity_conflict');
        return existing;
      }
      await this.db.run('INSERT INTO research_guided_progress (id, owner_id, block_id, assignment_id, tracking_session_id, snapshot_fingerprint, revision, progress_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [value.id, this.ownerId, value.blockId, value.assignmentId, value.trackingSessionId, value.snapshotFingerprint, 0, JSON.stringify(value.progress), value.updatedAt]);
      return { ...value, revision: 0 };
    }));
  }
  async compareAndSwap(expectedRevision: number, value: Omit<GuidedProgressRecord, 'revision'>): Promise<GuidedProgressRecord> {
    return serialize(() => this.db.transaction(async () => {
      const existing = await this.get(value.blockId, value.assignmentId);
      if (!existing) throw new Error('guided_progress_missing');
      if (existing.id !== value.id || existing.ownerId !== this.ownerId || existing.trackingSessionId !== value.trackingSessionId || existing.snapshotFingerprint !== value.snapshotFingerprint) throw new Error('guided_progress_identity_conflict');
      if (existing.revision !== expectedRevision) return existing;
      const nextRevision = existing.revision + 1;
      const result = await this.db.run('UPDATE research_guided_progress SET progress_json = ?, revision = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?', [JSON.stringify(value.progress), nextRevision, value.updatedAt, value.id, this.ownerId, expectedRevision]);
      if (result.changes !== 1) return (await this.get(value.blockId, value.assignmentId)) ?? existing;
      return { ...value, revision: nextRevision };
    }));
  }
}
