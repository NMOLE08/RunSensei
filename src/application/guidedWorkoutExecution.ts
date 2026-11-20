import * as Crypto from 'expo-crypto';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { ResearchFoundationRepository } from '@/data/researchFoundationRepository';
import { GuidedWorkoutProgressRepository, type GuidedProgressRecord } from '@/data/guidedWorkoutProgressRepository';
import { GuidedCuePreferencesRepository } from '@/data/guidedCuePreferencesRepository';
import { completeUntimedPhase, finishGuidedProgress, initialGuidedProgress, interruptGuidedProgress, pauseGuidedProgress, reconcileGuidedProgress, resolveGuidedWorkout, startGuidedProgress, validateGuidedProgress, type GuidedProgress, type GuidedWorkoutSnapshot } from '@/domain/tracking/guidedWorkout';
import { actionCue, countdownCue } from '@/domain/tracking/workoutCueEvents';
import { strictActiveSeconds } from '@/domain/tracking/session';
import { cancelGuidedCuesForFinish, dispatchGuidedCue, emitGuidedProgressCues, recoverGuidedCueReceipts } from './guidedWorkoutCues';
import { requireActiveAccountId } from './localAccount';
import { finishTracker, loadTrackerSnapshot, pauseTracker, recoverTracker, resumeTracker, startTracker, type TrackerSnapshot } from './workoutTracker';

export type GuidedExecutionSnapshot = { workout: GuidedWorkoutSnapshot; progress: GuidedProgress; tracker: TrackerSnapshot | null; productionEligible: false };
function ensureEnabled() { if (!experimental5kPreviewEnabled) throw new Error('Guided research workouts are unavailable in this build.'); }
async function repositories(ownerId: string) {
  ensureEnabled(); if (await requireActiveAccountId() !== ownerId) throw new Error('The signed-in account changed. Reopen this workout.');
  const db = await openAppDatabase(); await migrate(db, new Date().toISOString());
  return { db, research: new ResearchFoundationRepository(db, ownerId), progress: new GuidedWorkoutProgressRepository(db, ownerId), cuePreferences: new GuidedCuePreferencesRepository(db, ownerId) };
}
function trackerIdentity(tracker: TrackerSnapshot | null) {
  try { const value = JSON.parse(tracker?.session.prescriptionSnapshot ?? 'null') as { kind?: string; blockId?: string; assignmentId?: string; snapshotFingerprint?: string } | null;
    return value?.kind === 'guided_research' ? value : null;
  } catch { return null; }
}
function elapsed(tracker: TrackerSnapshot | null, now = Date.now()) { return tracker ? strictActiveSeconds(tracker.session.segments, tracker.session.status === 'interrupted' ? tracker.session.segments.at(-1)?.endedAtMs ?? now : tracker.session.status === 'paused' ? tracker.session.segments.at(-1)?.endedAtMs ?? now : now) : 0; }
function rowValue(record: GuidedProgressRecord, progress: GuidedProgress): Omit<GuidedProgressRecord, 'revision'> { const { revision: _revision, ...value } = record; return { ...value, progress, updatedAt: new Date().toISOString() }; }

async function emitActionCue(db: Awaited<ReturnType<typeof openAppDatabase>>, ownerId: string, sessionId: string, kind: 'workout_start' | 'pause' | 'resume' | 'workout_complete', transitionKey = 'once', source: 'foreground' | 'background' = 'foreground') {
  const preferences = await new GuidedCuePreferencesRepository(db, ownerId).get().catch(() => ({ voiceEnabled: false, muted: false, countdownEnabled: false }));
  await dispatchGuidedCue(db, actionCue(ownerId, sessionId, kind, transitionKey), { enabled: preferences.voiceEnabled, muted: preferences.muted }, source).catch(() => undefined);
}

export async function loadGuidedWorkoutExecution(ownerId: string, blockId: string, assignmentId: string): Promise<GuidedExecutionSnapshot> {
  const repos = await repositories(ownerId); const block = await repos.research.get(blockId); if (!block) throw new Error('This saved research workout does not belong to the signed-in account.');
  const workout = resolveGuidedWorkout(block, assignmentId);
  let record = await repos.progress.get(blockId, assignmentId);
  const activeTracker = await recoverTracker();
  const tracker = record && activeTracker?.session.id !== record.trackingSessionId ? await loadTrackerSnapshot(ownerId, record.trackingSessionId) : activeTracker;
  const identity = trackerIdentity(tracker);
  if (record && record.snapshotFingerprint !== workout.snapshotFingerprint) throw new Error('The saved workout snapshot changed. Its guided progress cannot be applied to the new prescription.');
  if (record && !validateGuidedProgress(record.progress, workout.phases)) throw new Error('Saved guided progress is invalid and requires review. The GPS recording remains unchanged.');
  if (!record && tracker && identity?.blockId === blockId && identity.assignmentId === assignmentId && identity.snapshotFingerprint === workout.snapshotFingerprint && tracker.session.ownerId === ownerId) {
    const base = initialGuidedProgress();
    record = await repos.progress.create({ id: `guided-${Crypto.randomUUID()}`, ownerId, blockId, assignmentId, trackingSessionId: tracker.session.id, snapshotFingerprint: workout.snapshotFingerprint, progress: tracker.session.status === 'interrupted' ? interruptGuidedProgress(startGuidedProgress(base), workout.phases, elapsed(tracker)) : startGuidedProgress(base), updatedAt: new Date().toISOString() });
  }
  if (record && tracker?.session.id === record.trackingSessionId) {
    await recoverGuidedCueReceipts(repos.db, ownerId, tracker.session.id).catch(() => undefined);
    const previousPhaseIndex = record.progress.phaseIndex;
    if (tracker.session.status === 'saved' && record.progress.status !== 'finished') {
      const next = finishGuidedProgress(record.progress, workout.phases, elapsed(tracker));
      record = await repos.progress.compareAndSwap(record.revision, rowValue(record, next));
    } else if (tracker.session.status === 'interrupted' && record.progress.status === 'running') {
      const next = interruptGuidedProgress(record.progress, workout.phases, elapsed(tracker));
      record = next === record.progress ? record : await repos.progress.compareAndSwap(record.revision, rowValue(record, next));
    } else if (tracker.session.status === 'recording' && record.progress.status === 'running') {
      const next = reconcileGuidedProgress(record.progress, workout.phases, elapsed(tracker));
      if (next.phaseIndex !== record.progress.phaseIndex) record = await repos.progress.compareAndSwap(record.revision, rowValue(record, next));
    } else if (tracker.session.status === 'recording' && record.progress.status === 'paused') {
      record = await repos.progress.compareAndSwap(record.revision, rowValue(record, startGuidedProgress(record.progress)));
    } else if (tracker.session.status === 'paused' && record.progress.status === 'running') {
      record = await repos.progress.compareAndSwap(record.revision, rowValue(record, pauseGuidedProgress(record.progress, workout.phases, elapsed(tracker))));
    }
    if (tracker.session.status === 'recording' && record.progress.status === 'running') await emitGuidedProgressCues(repos.db, ownerId, tracker.session.id, workout, previousPhaseIndex, record.progress, 'foreground');
  }
  return { workout, progress: record?.progress ?? initialGuidedProgress(), tracker, productionEligible: false };
}

let actionQueue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> { const next = actionQueue.then(fn); actionQueue = next.catch(() => undefined); return next; }

export function startGuidedWorkout(ownerId: string, blockId: string, assignmentId: string) {
  return exclusive(async () => {
    const repos = await repositories(ownerId); const block = await repos.research.get(blockId); if (!block) throw new Error('Research block is unavailable for this account.');
    const workout = resolveGuidedWorkout(block, assignmentId); let record = await repos.progress.get(blockId, assignmentId); let tracker = await recoverTracker();
    if (record) {
      if (record.snapshotFingerprint !== workout.snapshotFingerprint) throw new Error('Saved workout snapshot mismatch.');
      if (!validateGuidedProgress(record.progress, workout.phases)) throw new Error('Saved guided progress is invalid and requires review.');
      if (!tracker || tracker.session.id !== record.trackingSessionId) throw new Error('This workout recording is no longer active. Open its saved feedback or History.');
      if (tracker.session.status === 'interrupted' || record.progress.status === 'interrupted') throw new Error('This recording was interrupted. Finish the recorded portion for feedback; it will not resume automatically.');
      if (record.progress.status === 'paused' && tracker.session.status === 'paused') { await resumeTracker(); tracker = await recoverTracker(); record = await repos.progress.compareAndSwap(record.revision, rowValue(record, startGuidedProgress(record.progress))); }
      return { workout, progress: record.progress, tracker, productionEligible: false as const };
    }
    if (tracker) throw new Error('Another activity is already in progress. Finish it before starting this guided workout.');
    const prescription = JSON.stringify({ kind: 'guided_research', blockId, assignmentId, snapshotFingerprint: workout.snapshotFingerprint });
    await startTracker({ mode: 'run', timerOnly: false, prescription, researchCheckIn: { blockId, assignmentId } });
    tracker = await recoverTracker();
    if (!tracker || tracker.session.ownerId !== ownerId || tracker.session.status !== 'recording' || trackerIdentity(tracker)?.snapshotFingerprint !== workout.snapshotFingerprint) throw new Error('GPS recording did not start for this guided workout.');
    try {
      record = await repos.progress.create({ id: `guided-${Crypto.randomUUID()}`, ownerId, blockId, assignmentId, trackingSessionId: tracker.session.id, snapshotFingerprint: workout.snapshotFingerprint, progress: startGuidedProgress(initialGuidedProgress()), updatedAt: new Date().toISOString() });
    } catch (error) { await pauseTracker(); throw error; }
    await emitActionCue(repos.db, ownerId, tracker.session.id, 'workout_start');
    return { workout, progress: record.progress, tracker, productionEligible: false as const };
  });
}

async function updateProgress(ownerId: string, blockId: string, assignmentId: string, transform: (value: GuidedProgress, workout: GuidedWorkoutSnapshot, tracker: TrackerSnapshot) => GuidedProgress, actionCueKind?: 'pause' | 'resume') {
  const repos = await repositories(ownerId); const block = await repos.research.get(blockId); if (!block) throw new Error('Research block unavailable.'); const workout = resolveGuidedWorkout(block, assignmentId);
  const record = await repos.progress.get(blockId, assignmentId); const tracker = await recoverTracker();
  if (!record || !tracker || record.trackingSessionId !== tracker.session.id || tracker.session.ownerId !== ownerId || record.snapshotFingerprint !== workout.snapshotFingerprint) throw new Error('The saved GPS session does not match this guided workout.');
  const progress = transform(record.progress, workout, tracker); const next = await repos.progress.compareAndSwap(record.revision, rowValue(record, progress));
  if (actionCueKind && next.progress.status !== record.progress.status) await emitActionCue(repos.db, ownerId, tracker.session.id, actionCueKind, `r${record.revision}`);
  if (next.progress.phaseIndex > record.progress.phaseIndex) await emitGuidedProgressCues(repos.db, ownerId, tracker.session.id, workout, record.progress.phaseIndex, next.progress, 'foreground');
  return { workout, progress: next.progress, tracker: await recoverTracker(), productionEligible: false as const };
}
export async function pauseGuidedWorkout(ownerId: string, blockId: string, assignmentId: string) {
  await pauseTracker(); return updateProgress(ownerId, blockId, assignmentId, (p, w, t) => pauseGuidedProgress(p, w.phases, elapsed(t)), 'pause');
}
export async function resumeGuidedWorkout(ownerId: string, blockId: string, assignmentId: string) {
  return exclusive(async () => {
    const loaded = await loadGuidedWorkoutExecution(ownerId, blockId, assignmentId);
    if (loaded.progress.status !== 'paused' || loaded.tracker?.session.status !== 'paused') throw new Error('This workout is not manually paused and cannot be resumed.');
    await resumeTracker();
    return updateProgress(ownerId, blockId, assignmentId, (p) => startGuidedProgress(p), 'resume');
  });
}
export async function completeGuidedUntimedPhase(ownerId: string, blockId: string, assignmentId: string) {
  return updateProgress(ownerId, blockId, assignmentId, (p, w, t) => completeUntimedPhase(p, w.phases, elapsed(t)));
}
export async function reconcileGuidedWorkoutExecution(ownerId: string, blockId: string, assignmentId: string) {
  return updateProgress(ownerId, blockId, assignmentId, (p, w, t) => reconcileGuidedProgress(p, w.phases, elapsed(t)));
}

export async function maybeEmitGuidedCountdown(ownerId: string, blockId: string, assignmentId: string, crossedThreshold: boolean, thresholdSeconds = 10): Promise<void> {
  if (!crossedThreshold) return;
  try {
    const repos = await repositories(ownerId); const block = await repos.research.get(blockId); if (!block) return;
    const workout = resolveGuidedWorkout(block, assignmentId); const record = await repos.progress.get(blockId, assignmentId); const tracker = await recoverTracker();
    if (!record || !tracker || tracker.session.status !== 'recording' || record.trackingSessionId !== tracker.session.id || record.progress.status !== 'running') return;
    const phase = workout.phases[record.progress.phaseIndex]; if (!phase) return;
    const event = countdownCue(ownerId, tracker.session.id, phase, thresholdSeconds); if (!event) return;
    const preferences = await repos.cuePreferences.get();
    await dispatchGuidedCue(repos.db, event, { enabled: preferences.voiceEnabled && preferences.countdownEnabled, muted: preferences.muted }, 'foreground');
  } catch { /* Cue failure is intentionally isolated from GPS and phase state. */ }
}
export async function finishGuidedWorkout(ownerId: string, blockId: string, assignmentId: string) {
  return exclusive(async () => {
    const before = await loadGuidedWorkoutExecution(ownerId, blockId, assignmentId);
    if (!before.tracker || before.tracker.session.ownerId !== ownerId) throw new Error('Guided GPS session is unavailable.');
    if (before.tracker.session.status === 'saved' && before.progress.status === 'finished') return before;
    const saved = await finishTracker();
    const repos = await repositories(ownerId); const record = await repos.progress.get(blockId, assignmentId);
    if (!record || record.trackingSessionId !== saved.session.id) throw new Error('Guided progress does not match the saved GPS session.');
    await cancelGuidedCuesForFinish(repos.db, ownerId, saved.session.id).catch(() => undefined);
    const workout = before.workout; const progress = finishGuidedProgress(record.progress, workout.phases, elapsed(saved));
    const next = await repos.progress.compareAndSwap(record.revision, rowValue(record, { ...progress, status: 'finished' }));
    if (next.progress.phaseIndex >= workout.phases.length) await emitActionCue(repos.db, ownerId, saved.session.id, 'workout_complete');
    return { workout, progress: next.progress, tracker: saved, productionEligible: false as const };
  });
}
