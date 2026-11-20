export type TrackingState = 'idle' | 'preparing' | 'recording' | 'paused' | 'finishing' | 'saved' | 'interrupted' | 'cancelled' | 'error';
export interface RecordingSegment { startedAtMs: number; endedAtMs: number | null; }
export type TrackingMetricVersion = 1 | 2 | 3;
export interface TrainingSession { id: string; ownerId: string; plannedSessionId: string | null; prescriptionSnapshot: string | null; mode: 'run' | 'walk'; status: TrackingState; startedAtMs: number | null; endedAtMs: number | null; segments: RecordingSegment[]; distanceMeters: number | null; metricVersion: TrackingMetricVersion; }

export type RecordingTimelineIssue =
  | 'non_finite_segment'
  | 'negative_duration_segment'
  | 'open_segment_not_last'
  | 'overlapping_segment'
  | 'out_of_order_segment';

export type RecordingTimelineValidation = { valid: true } | { valid: false; issue: RecordingTimelineIssue; segmentIndex: number };

/** New metric calculations reject malformed timelines rather than double-counting them. */
export function validateRecordingTimeline(segments: readonly RecordingSegment[]): RecordingTimelineValidation {
  let previous: RecordingSegment | null = null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!Number.isFinite(segment.startedAtMs) || (segment.endedAtMs !== null && !Number.isFinite(segment.endedAtMs))) return { valid: false, issue: 'non_finite_segment', segmentIndex: index };
    if (segment.endedAtMs !== null && segment.endedAtMs < segment.startedAtMs) return { valid: false, issue: 'negative_duration_segment', segmentIndex: index };
    if (segment.endedAtMs === null && index !== segments.length - 1) return { valid: false, issue: 'open_segment_not_last', segmentIndex: index };
    if (previous) {
      if (segment.startedAtMs < previous.startedAtMs) return { valid: false, issue: 'out_of_order_segment', segmentIndex: index };
      if (previous.endedAtMs === null || segment.startedAtMs < previous.endedAtMs) return { valid: false, issue: 'overlapping_segment', segmentIndex: index };
    }
    previous = segment;
  }
  return { valid: true };
}

export class InvalidRecordingTimelineError extends Error {
  public constructor(public readonly validation: Exclude<RecordingTimelineValidation, { valid: true }>) {
    super(`invalid_recording_timeline:${validation.issue}:${validation.segmentIndex}`);
    this.name = 'InvalidRecordingTimelineError';
  }
}

export function assertValidRecordingTimeline(segments: readonly RecordingSegment[]): void {
  const validation = validateRecordingTimeline(segments);
  if (!validation.valid) throw new InvalidRecordingTimelineError(validation);
}

/** Open segments count only until an explicit observed checkpoint, not an unknown interruption. */
export function activeSeconds(segments: RecordingSegment[], observedAtMs: number): number {
  if (!Number.isFinite(observedAtMs)) return 0;
  return segments.reduce((sum, segment) => {
    if (observedAtMs <= segment.startedAtMs) return sum;
    const effectiveEnd = Math.min(segment.endedAtMs ?? observedAtMs, observedAtMs);
    return sum + Math.max(0, effectiveEnd - segment.startedAtMs);
  }, 0) / 1000;
}

/** Strict active time for live/new calculations; historical readers stay compatible. */
export function strictActiveSeconds(segments: readonly RecordingSegment[], observedAtMs: number): number {
  assertValidRecordingTimeline(segments);
  return activeSeconds(segments.map(segment => ({ ...segment })), observedAtMs);
}

export function activeMillisecondsAt(segments: readonly RecordingSegment[], observedAtMs: number): number {
  return Math.round(strictActiveSeconds(segments, observedAtMs) * 1000);
}

/** Observation timestamps, rather than callback time, own segment membership. */
export function recordingSegmentAt(segments: readonly RecordingSegment[], observationTimestampMs: number): number | null {
  if (!Number.isFinite(observationTimestampMs)) return null;
  assertValidRecordingTimeline(segments);
  const index = segments.findIndex(segment => observationTimestampMs >= segment.startedAtMs && (segment.endedAtMs === null || observationTimestampMs <= segment.endedAtMs));
  return index >= 0 ? index : null;
}

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
