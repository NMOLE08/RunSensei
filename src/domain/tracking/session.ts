export type TrackingState = 'idle' | 'preparing' | 'recording' | 'paused' | 'finishing' | 'saved' | 'interrupted' | 'cancelled' | 'error';
export interface RecordingSegment { startedAtMs: number; endedAtMs: number | null; }
export interface TrainingSession { id: string; ownerId: string; plannedSessionId: string | null; prescriptionSnapshot: string | null; mode: 'run' | 'walk'; status: TrackingState; startedAtMs: number | null; endedAtMs: number | null; segments: RecordingSegment[]; distanceMeters: number | null; metricVersion: 1; }

/** Open segments count only until an explicit observed checkpoint, not an unknown interruption. */
export function activeSeconds(segments: RecordingSegment[], observedAtMs: number): number { return segments.reduce((sum, segment) => sum + Math.max(0, (segment.endedAtMs ?? observedAtMs) - segment.startedAtMs), 0) / 1000; }

/** Explicit transitions prevent a second start and preserve pause boundaries. */
export function transitionSession(session: TrainingSession, action: 'start' | 'pause' | 'resume' | 'finish' | 'save' | 'interrupt' | 'cancel', atMs: number): TrainingSession {
  if (!Number.isFinite(atMs)) throw new Error('A valid timestamp is required.');
  const segments = session.segments.map((segment) => ({ ...segment }));
  const closeSegment = () => { const open = segments.at(-1); if (!open || open.endedAtMs !== null || atMs < open.startedAtMs) throw new Error('Invalid recording segment.'); open.endedAtMs = atMs; };
  switch (action) {
    case 'start': if (session.status !== 'preparing') break; return { ...session, status: 'recording', startedAtMs: atMs, segments: [{ startedAtMs: atMs, endedAtMs: null }] };
    case 'pause': if (session.status !== 'recording') break; closeSegment(); return { ...session, status: 'paused', segments };
    case 'resume': if (session.status !== 'paused') break; if (segments.at(-1)?.endedAtMs === null || atMs < (segments.at(-1)?.endedAtMs ?? 0)) throw new Error('Invalid resume time.'); return { ...session, status: 'recording', segments: [...segments, { startedAtMs: atMs, endedAtMs: null }] };
    case 'interrupt': if (session.status !== 'recording') break; closeSegment(); return { ...session, status: 'interrupted', segments };
    case 'finish': if (session.status !== 'recording' && session.status !== 'paused' && session.status !== 'interrupted') break; if (session.status === 'recording') closeSegment(); return { ...session, status: 'finishing', endedAtMs: atMs, segments };
    case 'save': if (session.status !== 'finishing') break; return { ...session, status: 'saved' };
    case 'cancel': if (session.status !== 'preparing' && session.status !== 'paused' && session.status !== 'interrupted') break; return { ...session, status: 'cancelled', endedAtMs: atMs };
  }
  throw new Error(`Cannot ${action} while session is ${session.status}.`);
}
