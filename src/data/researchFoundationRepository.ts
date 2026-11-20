import type { SqlDatabase } from './database';
import { currentResearchOutcomes, researchBlockKey, snapshotResearchBlock, type ResearchBlock, type ResearchOutcome } from '@/domain/planning/researchFoundation';
import { analyzeWorkoutPerformance } from '@/domain/performance/analyzeWorkoutPerformance';
import { TrainingRepository } from './repositories';

type Payload = { payload_json: string };
// Shared across repository instances: prevent asynchronous UI actions for different
// screens from interleaving research transactions on the same SQLite connection.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation); queue = result.catch(() => undefined); return result;
}
export class ResearchFoundationRepository {
  constructor(private readonly db: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('research_owner_required'); }
  async blocks(): Promise<ResearchBlock[]> {
    const rows = await this.db.getAll<Payload>('SELECT payload_json FROM research_foundation_blocks WHERE owner_id = ? ORDER BY rowid', [this.ownerId]);
    return rows.map(r => JSON.parse(r.payload_json) as ResearchBlock);
  }
  async get(id: string) {
    return (await this.blocks()).find(b => b.id === id) ?? null;
  }
  async saveBlock(block: ResearchBlock): Promise<ResearchBlock> {
    return serialized(() => this.db.transaction(async () => {
      if (block.ownerId !== this.ownerId || !block.researchOnly || block.productionEligible) throw new Error('research_owner_or_release_mismatch');
      if (JSON.stringify(snapshotResearchBlock(block).assignments) !== JSON.stringify(block.assignments)) throw new Error('research_assignment_snapshot_mismatch');
      const blocks = await this.blocks();
      const key = researchBlockKey(block.evidenceReference, block.program);
      const old = blocks.find(b => researchBlockKey(b.evidenceReference, b.program) === key);
      if (old) return old;
      if (block.parentBlockId && !blocks.some(b => b.id === block.parentBlockId)) throw new Error('research_parent_missing');
      if (block.parentBlockId && blocks.some(b => b.parentBlockId === block.parentBlockId)) throw new Error('research_successor_already_exists');
      if (block.parentBlockId) {
        const source = await this.outcomes(block.parentBlockId);
        if (!block.transitionProvenance || JSON.stringify(source.map(o => o.id).sort()) !== JSON.stringify([...block.transitionProvenance.sourceOutcomeIds].sort())) throw new Error('stale_reassessment_evidence');
        const decision = await this.db.getFirst<{ id: string }>('SELECT id FROM research_foundation_decisions WHERE id = ? AND owner_id = ?', [block.transitionProvenance.decisionId, this.ownerId]);
        if (!decision) throw new Error('reassessment_decision_missing');
        const all = await this.db.getAll<Payload>('SELECT payload_json FROM research_foundation_outcomes WHERE owner_id = ? ORDER BY rowid', [this.ownerId]);
        if (all.some(r => (JSON.parse(r.payload_json) as ResearchOutcome).record.discomfort === 'pain_or_injury_concern')) throw new Error('health_concern_requires_review');
      }
      await this.db.run('INSERT INTO research_foundation_blocks (id, owner_id, identity_key, parent_block_id, lifecycle_state, payload_json) VALUES (?, ?, ?, ?, ?, ?)', [block.id, this.ownerId, key, block.parentBlockId, 'saved', JSON.stringify(block)]);
      if (block.parentBlockId) await this.db.run('UPDATE research_foundation_blocks SET lifecycle_state = ? WHERE id = ? AND owner_id = ?', ['successor_saved', block.parentBlockId, this.ownerId]);
      return block;
    }));
  }
  async outcomes(blockId: string): Promise<ResearchOutcome[]> {
    if (!await this.get(blockId)) throw new Error('research_block_not_owned');
    const rows = await this.db.getAll<Payload>('SELECT payload_json FROM research_foundation_outcomes WHERE owner_id = ? ORDER BY rowid', [this.ownerId]);
    return rows.map(r => JSON.parse(r.payload_json) as ResearchOutcome).filter(o => o.blockId === blockId);
  }
  async saveOutcome(value: ResearchOutcome): Promise<void> {
    return serialized(() => this.db.transaction(async () => {
      const block = await this.get(value.blockId);
      const assignment = block?.assignments.find(a => a.assignmentId === value.assignmentId);
      if (!assignment) throw new Error('research_assignment_not_owned');
      const history = await this.outcomes(value.blockId);
      const retry = history.find(o => o.id === value.id);
      if (retry) { if (JSON.stringify(retry) !== JSON.stringify(value)) throw new Error('outcome_id_reused'); return; }
      const superseded = new Set(history.map(o => o.previousVersionId));
      const latest = history.find(o => o.assignmentId === value.assignmentId && !superseded.has(o.id));
      if ((latest?.id ?? null) !== value.previousVersionId) throw new Error('stale_outcome_correction');
      if (value.record.workoutId !== assignment.logicalSessionId || value.record.planId !== block!.id || value.record.revisionId !== block!.id || JSON.stringify(value.record.policyReferences) !== JSON.stringify(assignment.policyReferences)) throw new Error('outcome_snapshot_mismatch');
      if (analyzeWorkoutPerformance(value.record, assignment).dataQualityIssues.length && !value.removed) throw new Error('invalid_workout_evidence');
      if (value.associatedActivityId) {
        const rows = await this.db.getAll<Payload>('SELECT payload_json FROM research_foundation_outcomes WHERE owner_id = ? ORDER BY rowid', [this.ownerId]);
        const active = currentResearchOutcomes(rows.map(r => JSON.parse(r.payload_json) as ResearchOutcome));
        if (value.associatedActivityId.startsWith('tracking:')) {
          const tracking = await this.db.getFirst<{ state: string; planned_session_id: string | null }>('SELECT state, planned_session_id FROM tracking_sessions WHERE id = ? AND owner_id = ?', [value.associatedActivityId.slice('tracking:'.length), this.ownerId]);
          if (!tracking || tracking.state !== 'saved' || tracking.planned_session_id) throw new Error('recording_not_owned_or_not_available');
          if (active.some(o => o.associatedActivityId === value.associatedActivityId && o.assignmentId !== value.assignmentId)) throw new Error('activity_already_associated');
        } else {
        const logs = await new TrainingRepository(this.db, this.ownerId).getActivityHistory();
        const activity = logs.find(l => l.id === value.associatedActivityId);
        if (!activity) throw new Error('activity_not_owned');
        if (activity.sessionId || logs.some(l => l.previousVersionId === activity.id)) throw new Error('activity_already_assigned_or_superseded');
        const family = (id: string) => {
          const seen = new Set<string>(); let cursor = logs.find(l => l.id === id);
          while (cursor?.previousVersionId) {
            if (seen.has(cursor.id)) throw new Error('activity_correction_cycle');
            seen.add(cursor.id); cursor = logs.find(l => l.id === cursor!.previousVersionId);
            if (!cursor) throw new Error('activity_history_incomplete');
          }
          return cursor?.id ?? id;
        };
        if (active.some(o => o.associatedActivityId && family(o.associatedActivityId) === family(value.associatedActivityId!) && o.assignmentId !== value.assignmentId)) throw new Error('activity_already_associated');
        }
      }
      await this.db.run('INSERT INTO research_foundation_outcomes (id, owner_id, block_id, assignment_id, previous_id, activity_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [value.id, this.ownerId, value.blockId, value.assignmentId, value.previousVersionId, value.associatedActivityId, JSON.stringify(value)]);
      if (value.associatedActivityId?.startsWith('tracking:')) await this.db.run('DELETE FROM research_pending_checkins WHERE owner_id = ? AND activity_id = ?', [this.ownerId, value.associatedActivityId.slice('tracking:'.length)]);
      const completeHistory = [...history, value];
      const count = currentResearchOutcomes(completeHistory).length;
      const state = completeHistory.some(o => o.record.discomfort === 'pain_or_injury_concern') ? 'health_hold' : count === block!.assignments.length ? 'outcomes_recorded' : count > 0 ? 'in_progress' : 'saved';
      await this.db.run('UPDATE research_foundation_blocks SET lifecycle_state = ? WHERE id = ? AND owner_id = ?', [state, value.blockId, this.ownerId]);
    }));
  }
  async saveDecision(id: string, blockId: string, payload: unknown) {
    if (!await this.get(blockId)) throw new Error('research_block_not_owned');
    await this.db.run('INSERT INTO research_foundation_decisions (id, owner_id, block_id, payload_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING', [id, this.ownerId, blockId, JSON.stringify(payload)]);
  }
  async decisions(blockId: string): Promise<{ decision: import('@/domain/planning/researchFoundation').ResearchReassessment; evaluatedAt: string }[]> {
    if (!await this.get(blockId)) throw new Error('research_block_not_owned');
    const rows = await this.db.getAll<Payload>('SELECT payload_json FROM research_foundation_decisions WHERE owner_id = ? ORDER BY rowid', [this.ownerId]);
    return rows.map(r => JSON.parse(r.payload_json)).filter(r => r.decision.sourceBlockId === blockId);
  }
  async lifecycle(blockId: string) {
    const row = await this.db.getFirst<{ lifecycle_state: string }>('SELECT lifecycle_state FROM research_foundation_blocks WHERE id = ? AND owner_id = ?', [blockId, this.ownerId]);
    if (!row) throw new Error('research_block_not_owned');
    return row.lifecycle_state;
  }
}
