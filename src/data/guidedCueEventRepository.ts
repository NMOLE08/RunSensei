import type { SqlDatabase } from './database';
import type { CueSuppression, GuidedCueEvent } from '@/domain/tracking/workoutCueEvents';

export type CueReceiptStatus = 'claimed' | 'playback_attempted' | 'playback_completed' | 'playback_failed' | 'suppressed_stale' | 'suppressed_muted' | 'suppressed_disabled' | 'playback_superseded';
export type CueReceipt = { ownerId: string; sessionId: string; eventId: string; kind: string; phaseId: string | null; status: CueReceiptStatus; attemptedAt: string | null; completedAt: string | null; errorCode: string | null };
type Stored = { owner_id: string; session_id: string; event_id: string; kind: string; phase_id: string | null; status: CueReceiptStatus; attempted_at: string | null; completed_at: string | null; error_code: string | null };
const decode = (row: Stored): CueReceipt => ({ ownerId: row.owner_id, sessionId: row.session_id, eventId: row.event_id, kind: row.kind, phaseId: row.phase_id, status: row.status, attemptedAt: row.attempted_at, completedAt: row.completed_at, errorCode: row.error_code });

/** INSERT is the atomic claim: only the caller whose insert changed one row may play it. */
export class GuidedCueEventRepository {
  constructor(private readonly db: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('guided_cue_owner_required'); }
  async claim(event: GuidedCueEvent, at: string): Promise<boolean> {
    if (event.ownerId !== this.ownerId) throw new Error('guided_cue_owner_mismatch');
    const result = await this.db.run("INSERT OR IGNORE INTO guided_cue_events (owner_id, session_id, event_id, kind, phase_id, status, claimed_at) VALUES (?, ?, ?, ?, ?, 'claimed', ?)", [this.ownerId, event.sessionId, event.eventId, event.kind, event.phaseId, at]);
    return result.changes === 1;
  }
  async suppress(value: CueSuppression, sessionId: string, at: string): Promise<void> {
    const status = value.reason === 'stale' ? 'suppressed_stale' : value.reason === 'muted' ? 'suppressed_muted' : 'suppressed_disabled';
    await this.db.run('INSERT OR IGNORE INTO guided_cue_events (owner_id, session_id, event_id, kind, phase_id, status, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [this.ownerId, sessionId, value.eventId, value.kind, value.phaseId, status, at]);
  }
  async update(sessionId: string, eventId: string, status: CueReceiptStatus, at: string, errorCode: string | null = null): Promise<void> {
    const attemptedAt = status === 'playback_attempted' ? at : null;
    const completedAt = status === 'playback_completed' || status === 'playback_failed' || status === 'playback_superseded' ? at : null;
    await this.db.run('UPDATE guided_cue_events SET status = ?, attempted_at = COALESCE(?, attempted_at), completed_at = COALESCE(?, completed_at), error_code = ? WHERE owner_id = ? AND session_id = ? AND event_id = ?', [status, attemptedAt, completedAt, errorCode, this.ownerId, sessionId, eventId]);
  }
  async get(sessionId: string, eventId: string): Promise<CueReceipt | null> {
    const row = await this.db.getFirst<Stored>('SELECT owner_id, session_id, event_id, kind, phase_id, status, attempted_at, completed_at, error_code FROM guided_cue_events WHERE owner_id = ? AND session_id = ? AND event_id = ?', [this.ownerId, sessionId, eventId]);
    return row ? decode(row) : null;
  }
  async receipts(sessionId: string): Promise<CueReceipt[]> {
    return (await this.db.getAll<Stored>('SELECT owner_id, session_id, event_id, kind, phase_id, status, attempted_at, completed_at, error_code FROM guided_cue_events WHERE owner_id = ? AND session_id = ? ORDER BY claimed_at', [this.ownerId, sessionId])).map(decode);
  }
  async failPendingAfterRestart(sessionId: string, at: string, activeEventId?: string): Promise<void> {
    const exclusion = activeEventId ? ' AND event_id <> ?' : '';
    await this.db.run(`UPDATE guided_cue_events SET status = 'playback_failed', completed_at = ?, error_code = 'process_restarted_before_callback' WHERE owner_id = ? AND session_id = ? AND status IN ('claimed','playback_attempted')${exclusion}`, activeEventId ? [at, this.ownerId, sessionId, activeEventId] : [at, this.ownerId, sessionId]);
  }
}
