import { GuidedCueEventRepository } from '@/data/guidedCueEventRepository';
import { GuidedCuePreferencesRepository } from '@/data/guidedCuePreferencesRepository';
import type { GuidedCueEvent } from '@/domain/tracking/workoutCueEvents';
import type { SqlDatabase } from '@/data/database';
import { SystemSpeechCuePlayer } from '@/services/audio/systemSpeechCuePlayer';
import type { GuidedVoiceProvider } from '@/services/audio/guidedVoiceProvider';
import type { GuidedProgress, GuidedWorkoutSnapshot } from '@/domain/tracking/guidedWorkout';
import { actionCue, phaseTransitionBatch } from '@/domain/tracking/workoutCueEvents';

export type CueSource = 'foreground' | 'background';
let player: GuidedVoiceProvider = new SystemSpeechCuePlayer();
let active: { ownerId: string; sessionId: string; eventId: string; kind: GuidedCueEvent['kind']; priority: number; token: number } | null = null;
let nextToken = 0;
let cueQueue: Promise<void> = Promise.resolve();
const recoveredSessions = new Set<string>();

function serializeCue<T>(operation: () => Promise<T>): Promise<T> {
  const result = cueQueue.then(operation);
  cueQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function setGuidedVoiceProviderForTests(value: GuidedVoiceProvider) { player = value; }
export async function resetGuidedCueCoordinatorForTests() { await player.stop().catch(() => undefined); active = null; cueQueue = Promise.resolve(); recoveredSessions.clear(); nextToken = 0; player = new SystemSpeechCuePlayer(); }

/** Claims before speaking; callbacks record delivery truth, never workout truth. */
export function dispatchGuidedCue(db: SqlDatabase, event: GuidedCueEvent, options: { enabled: boolean; muted: boolean }, source: CueSource): Promise<void> {
  return serializeCue(() => dispatchGuidedCueNow(db, event, options, source));
}

async function dispatchGuidedCueNow(db: SqlDatabase, event: GuidedCueEvent, options: { enabled: boolean; muted: boolean }, source: CueSource): Promise<void> {
  const receipts = new GuidedCueEventRepository(db, event.ownerId);
  const now = new Date().toISOString();
  if (!options.enabled || options.muted) {
    if (options.muted && active?.ownerId === event.ownerId && active.sessionId === event.sessionId) await stopActive(db, active.ownerId, active.sessionId, 'playback_superseded', 'muted_by_runner');
    await receipts.suppress({ eventId: event.eventId, kind: event.kind, phaseId: event.phaseId, reason: options.muted ? 'muted' : 'disabled' }, event.sessionId, now).catch(() => undefined);
    return;
  }
  // A concurrent duplicate must not stop the very playback it is duplicating.
  // The persisted atomic claim remains the cross-process source of truth.
  if (active?.ownerId === event.ownerId && active.sessionId === event.sessionId && active.eventId === event.eventId) return;
  // Headless TTS is experimental. It is still isolated from the GPS write path.
  // A failure is receipted once and is never queued for later replay.
  if (active) {
    const phaseSupersedesPhase = event.kind === 'phase_transition' && event.priority === active.priority;
    const currentActionSupersedesOldAction = (event.kind === 'pause' || event.kind === 'resume') && (active.kind === 'pause' || active.kind === 'resume') && event.priority === active.priority;
    const samePriorityMaySupersede = phaseSupersedesPhase || currentActionSupersedesOldAction;
    if (active.priority > event.priority || (active.priority === event.priority && !samePriorityMaySupersede)) {
      await receipts.suppress({ eventId: event.eventId, kind: event.kind, phaseId: event.phaseId, reason: 'stale' }, event.sessionId, now).catch(() => undefined);
      return;
    }
  }
  if (active) await stopActive(db, active.ownerId, active.sessionId, 'playback_superseded');
  const claimed = await receipts.claim(event, now).catch(() => false);
  if (!claimed) return;
  const token = ++nextToken;
  active = { ownerId: event.ownerId, sessionId: event.sessionId, eventId: event.eventId, kind: event.kind, priority: event.priority, token };
  const finish = (status: 'playback_completed' | 'playback_failed', code: string | null = null) => {
    if (active?.token !== token) return;
    active = null;
    void receipts.update(event.sessionId, event.eventId, status, new Date().toISOString(), code).catch(() => undefined);
  };
  try {
    const availability = await player.availability();
    if (!availability.available) { finish('playback_failed', 'system_tts_unavailable'); return; }
    await receipts.update(event.sessionId, event.eventId, 'playback_attempted', new Date().toISOString()).catch(() => undefined);
    await player.speak(event.text, {
      onCompleted: () => finish('playback_completed'),
      onFailed: code => finish('playback_failed', code || 'system_speech_error'),
      onStopped: () => finish('playback_failed', 'speech_stopped'),
    });
  } catch {
    finish('playback_failed', source === 'background' ? 'headless_speech_failed' : 'system_speech_error');
  }
}

async function stopActive(db: SqlDatabase, ownerId: string, sessionId: string, status: 'playback_superseded' | 'playback_failed', reasonCode?: string) {
  const previous = active;
  if (!previous || previous.ownerId !== ownerId || previous.sessionId !== sessionId) return;
  active = null;
  await player.stop().catch(() => undefined);
  await new GuidedCueEventRepository(db, ownerId).update(sessionId, previous.eventId, status, new Date().toISOString(), reasonCode ?? (status === 'playback_superseded' ? 'superseded_by_current_cue' : 'speech_stopped')).catch(() => undefined);
}

export async function stopGuidedSpeech(db: SqlDatabase, ownerId: string, sessionId: string) {
  await serializeCue(() => stopActive(db, ownerId, sessionId, 'playback_superseded', 'muted_by_runner'));
}

/** Finish invalidates any pending phase/countdown speech before the completion cue is considered. */
export async function cancelGuidedCuesForFinish(db: SqlDatabase, ownerId: string, sessionId: string) {
  await serializeCue(async () => {
    // A current completion announcement is meaningful, not stale; preserve it.
    if (active?.ownerId === ownerId && active.sessionId === sessionId && active.eventId === actionCue(ownerId, sessionId, 'workout_complete').eventId) return;
    await stopActive(db, ownerId, sessionId, 'playback_superseded', 'workout_finished');
  });
}

export async function recoverGuidedCueReceipts(db: SqlDatabase, ownerId: string, sessionId: string) {
  const key = `${ownerId}:${sessionId}`;
  if (recoveredSessions.has(key)) return;
  const activeEventId = active?.ownerId === ownerId && active.sessionId === sessionId ? active.eventId : undefined;
  await new GuidedCueEventRepository(db, ownerId).failPendingAfterRestart(sessionId, new Date().toISOString(), activeEventId);
  recoveredSessions.add(key);
}

export async function emitGuidedProgressCues(db: SqlDatabase, ownerId: string, sessionId: string, workout: GuidedWorkoutSnapshot, previousIndex: number, progress: GuidedProgress, source: CueSource): Promise<void> {
  if (progress.phaseIndex <= previousIndex) return;
  const batch = phaseTransitionBatch(ownerId, sessionId, workout.phases, previousIndex, progress.phaseIndex);
  const receipts = new GuidedCueEventRepository(db, ownerId);
  for (const skipped of batch.suppress) await receipts.suppress(skipped, sessionId, new Date().toISOString()).catch(() => undefined);
  const preferences = await new GuidedCuePreferencesRepository(db, ownerId).get().catch(() => ({ voiceEnabled: false, muted: false, countdownEnabled: false }));
  if (batch.speak) await dispatchGuidedCue(db, batch.speak, { enabled: preferences.voiceEnabled, muted: preferences.muted }, source).catch(() => undefined);
  else if (progress.phaseIndex >= workout.phases.length) await dispatchGuidedCue(db, actionCue(ownerId, sessionId, 'workout_complete'), { enabled: preferences.voiceEnabled, muted: preferences.muted }, source).catch(() => undefined);
}

export async function guidedVoiceAvailability() { return player.availability(); }
