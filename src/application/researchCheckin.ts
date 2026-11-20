import type { SqlDatabase } from '@/data/database';

type PendingRow = { block_id: string; assignment_id: string };
type ResearchBlockPayload = { assignments?: { assignmentId?: string }[] };

/** Persist the research association beside (but not inside) a standalone GPS activity. */
export async function retainPendingResearchCheckin(db: SqlDatabase, ownerId: string, activityId: string, blockId: string, assignmentId: string, createdAt: string) {
  if (!ownerId || !activityId || !blockId || !assignmentId) throw new Error('research_checkin_identity_required');
  const session = await db.getFirst<{ id: string; state: string; planned_session_id: string | null }>(
    'SELECT id, state, planned_session_id FROM tracking_sessions WHERE id = ? AND owner_id = ?',
    [activityId, ownerId],
  );
  if (!session || session.planned_session_id !== null || !['recording', 'paused', 'finishing', 'saved', 'interrupted'].includes(session.state)) throw new Error('research_checkin_activity_not_owned');
  const block = await db.getFirst<{ payload_json: string }>('SELECT payload_json FROM research_foundation_blocks WHERE id = ? AND owner_id = ?', [blockId, ownerId]);
  if (!block) throw new Error('research_checkin_block_not_owned');
  const payload = JSON.parse(block.payload_json) as ResearchBlockPayload;
  if (!payload.assignments?.some(assignment => assignment.assignmentId === assignmentId)) throw new Error('research_checkin_assignment_not_in_block');
  const recorded = await db.getFirst<{ id: string }>('SELECT id FROM research_foundation_outcomes WHERE owner_id = ? AND activity_id = ?', [ownerId, `tracking:${activityId}`]);
  if (recorded) return;
  const existing = await db.getFirst<PendingRow>('SELECT block_id, assignment_id FROM research_pending_checkins WHERE owner_id = ? AND activity_id = ?', [ownerId, activityId]);
  if (existing) {
    if (existing.block_id !== blockId || existing.assignment_id !== assignmentId) throw new Error('research_checkin_activity_already_linked');
    return;
  }
  await db.run(
    'INSERT INTO research_pending_checkins (owner_id, activity_id, block_id, assignment_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id, activity_id) DO NOTHING',
    [ownerId, activityId, blockId, assignmentId, createdAt],
  );
}
