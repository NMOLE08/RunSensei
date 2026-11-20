import type { SqlDatabase } from '@/data/database';
import { GuidedWorkoutProgressRepository } from '@/data/guidedWorkoutProgressRepository';
import { GuidedCuePreferencesRepository } from '@/data/guidedCuePreferencesRepository';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { reconcileGuidedProgress, resolveGuidedWorkout } from '@/domain/tracking/guidedWorkout';
import { countdownCue, isCountdownCrossing } from '@/domain/tracking/workoutCueEvents';
import { strictActiveSeconds, type RecordingSegment } from '@/domain/tracking/session';
import { dispatchGuidedCue, emitGuidedProgressCues } from './guidedWorkoutCues';

export type BackgroundGuidedSession = { id: string; owner_id: string; state: string; prescription_json: string | null; segments_json: string; checkpoint_at_ms: number };

/** Called after the existing GPS batch transaction. All failures are isolated from route persistence. */
export async function reconcileBackgroundGuidedCues(db: SqlDatabase, row: BackgroundGuidedSession, observedAtMs: number): Promise<void> {
  try {
    if (row.state !== 'recording' || !row.prescription_json) return;
    const identity = JSON.parse(row.prescription_json) as { kind?: string; blockId?: string; assignmentId?: string; snapshotFingerprint?: string };
    if (identity.kind !== 'guided_research' || !identity.blockId || !identity.assignmentId) return;
    const blockRepository = new ResearchFoundationRepository(db, row.owner_id);
    const block = await blockRepository.get(identity.blockId); if (!block) return;
    const workout = resolveGuidedWorkout(block, identity.assignmentId);
    if (workout.snapshotFingerprint !== identity.snapshotFingerprint) return;
    const progressRepository = new GuidedWorkoutProgressRepository(db, row.owner_id);
    const record = await progressRepository.get(identity.blockId, identity.assignmentId);
    if (!record || record.trackingSessionId !== row.id || record.snapshotFingerprint !== workout.snapshotFingerprint || record.progress.status !== 'running') return;
    const segments = JSON.parse(row.segments_json) as RecordingSegment[];
    const previousActive = strictActiveSeconds(segments, row.checkpoint_at_ms);
    const currentActive = strictActiveSeconds(segments, observedAtMs);
    const previousPhase = record.progress.phaseIndex;
    const next = reconcileGuidedProgress(record.progress, workout.phases, currentActive);
    if (next.phaseIndex > previousPhase) {
      const persisted = await progressRepository.compareAndSwap(record.revision, { id: record.id, ownerId: row.owner_id, blockId: identity.blockId, assignmentId: identity.assignmentId, trackingSessionId: row.id, snapshotFingerprint: workout.snapshotFingerprint, progress: next, updatedAt: new Date(observedAtMs).toISOString() });
      await emitGuidedProgressCues(db, row.owner_id, row.id, workout, previousPhase, persisted.progress, 'background');
      return; // A phase transition supersedes any countdown that elapsed in the same batch.
    }
    const phase = workout.phases[record.progress.phaseIndex];
    if (!phase || phase.target.kind !== 'duration_seconds') return;
    const previousRemaining = phase.target.value - Math.max(0, previousActive - record.progress.phaseStartedAtActiveSeconds);
    const currentRemaining = phase.target.value - Math.max(0, currentActive - record.progress.phaseStartedAtActiveSeconds);
    if (!isCountdownCrossing(previousRemaining, currentRemaining, 10)) return;
    const preferences = await new GuidedCuePreferencesRepository(db, row.owner_id).get();
    const event = countdownCue(row.owner_id, row.id, phase, 10);
    if (event) await dispatchGuidedCue(db, event, { enabled: preferences.voiceEnabled && preferences.countdownEnabled, muted: preferences.muted }, 'background');
  } catch {
    // Headless voice support is experimental: it can never fail or delay GPS persistence.
  }
}

