import type { SqlDatabase, SqlResult, SqlValue } from '@/data/database';
import { GuidedCuePreferencesRepository } from '@/data/guidedCuePreferencesRepository';
import { GuidedCueEventRepository } from '@/data/guidedCueEventRepository';
import { actionCue, phaseCue } from '@/domain/tracking/workoutCueEvents';
import type { GuidedPhase } from '@/domain/tracking/guidedWorkout';
import { cancelGuidedCuesForFinish, dispatchGuidedCue, recoverGuidedCueReceipts, resetGuidedCueCoordinatorForTests, setGuidedVoiceProviderForTests } from '@/application/guidedWorkoutCues';
import type { GuidedVoiceProvider, SpeechCallbacks } from '@/services/audio/guidedVoiceProvider';

type Row = Record<string, SqlValue>;
class CueDatabase implements SqlDatabase {
  events: Row[] = [];
  preferences = new Map<string, Row>();
  async run(sql: string, params: SqlValue[] = []): Promise<SqlResult> {
    if (sql.includes('INSERT OR IGNORE INTO guided_cue_events')) {
      const [owner_id, session_id, event_id, kind, phase_id] = params;
      if (this.events.some(row => row.owner_id === owner_id && row.session_id === session_id && row.event_id === event_id)) return { changes: 0, lastInsertRowId: 0 };
      const suppressed = sql.includes('status, claimed_at') && !sql.includes("'claimed'");
      const status = suppressed ? params[5] : 'claimed';
      const claimed_at = suppressed ? params[6] : params[5];
      this.events.push({ owner_id, session_id, event_id, kind, phase_id, status, claimed_at, attempted_at: null, completed_at: null, error_code: null });
      return { changes: 1, lastInsertRowId: this.events.length };
    }
    if (sql.includes('WHERE owner_id = ? AND session_id = ? AND event_id = ?')) {
      const [status, attempted_at, completed_at, error_code, owner_id, session_id, event_id] = params;
      const row = this.events.find(item => item.owner_id === owner_id && item.session_id === session_id && item.event_id === event_id);
      if (!row) return { changes: 0, lastInsertRowId: 0 };
      row.status = status; if (attempted_at !== null) row.attempted_at = attempted_at; if (completed_at !== null) row.completed_at = completed_at; row.error_code = error_code;
      return { changes: 1, lastInsertRowId: 0 };
    }
    if (sql.startsWith('UPDATE guided_cue_events SET status')) {
      const [completed_at, owner_id, session_id, ...excluded] = params;
      let changes = 0;
      for (const row of this.events) if (row.owner_id === owner_id && row.session_id === session_id && ['claimed', 'playback_attempted'].includes(String(row.status)) && (!excluded.length || row.event_id !== excluded[0])) { row.status = 'playback_failed'; row.completed_at = completed_at; row.error_code = 'process_restarted_before_callback'; changes++; }
      return { changes, lastInsertRowId: 0 };
    }
    if (sql.startsWith('INSERT INTO guided_cue_preferences')) {
      const [owner_id, voice_enabled, muted, countdown_enabled, updated_at] = params;
      this.preferences.set(String(owner_id), { owner_id, voice_enabled, muted, countdown_enabled, updated_at });
      return { changes: 1, lastInsertRowId: 0 };
    }
    return { changes: 0, lastInsertRowId: 0 };
  }
  async getFirst<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    if (sql.includes('FROM guided_cue_preferences')) return (this.preferences.get(String(params[0])) as T | undefined) ?? null;
    if (sql.includes('FROM guided_cue_events')) return (this.events.find(row => row.owner_id === params[0] && row.session_id === params[1] && row.event_id === params[2]) as T | undefined) ?? null;
    return null;
  }
  async getAll<T>(sql: string, params: SqlValue[] = []): Promise<T[]> { return this.events.filter(row => row.owner_id === params[0] && row.session_id === params[1]) as T[]; }
  async transaction<T>(operation: () => Promise<T>): Promise<T> { return operation(); }
}

class FakePlayer implements GuidedVoiceProvider {
  readonly id = 'system_tts' as const;
  calls: { text: string; callbacks: SpeechCallbacks }[] = [];
  stops = 0;
  available = true;
  fail = false;
  async availability() { return { available: this.available, label: this.available ? 'Generic system voice' : 'System speech unavailable' }; }
  async speak(text: string, callbacks: SpeechCallbacks) { if (this.fail) throw new Error('engine failure'); this.calls.push({ text, callbacks }); }
  async stop() { this.stops++; }
}

const runPhase: GuidedPhase = { id: 'w1:run:1', sourceStepIndex: 0, repetition: 1, kind: 'run', instruction: 'Run easy', purpose: 'Aerobic', effort: 'Conversational', target: { kind: 'duration_seconds', value: 120 } };
const cue = (session: string, kind: 'workout_start' | 'pause' | 'resume' | 'workout_complete' = 'workout_start') => actionCue('account-a', session, kind);

let db: CueDatabase; let player: FakePlayer;
beforeEach(async () => { db = new CueDatabase(); player = new FakePlayer(); setGuidedVoiceProviderForTests(player); });
afterEach(async () => { await resetGuidedCueCoordinatorForTests(); });

test('atomic receipt claim makes concurrent duplicate attempts speak once and records callback completion truthfully', async () => {
  const event = cue('session-once');
  await Promise.all([dispatchGuidedCue(db, event, { enabled: true, muted: false }, 'foreground'), dispatchGuidedCue(db, event, { enabled: true, muted: false }, 'foreground')]);
  expect(player.calls).toHaveLength(1); expect(player.stops).toBe(0);
  const receipts = new GuidedCueEventRepository(db, 'account-a');
  expect((await receipts.get(event.sessionId, event.eventId))?.status).toBe('playback_attempted');
  player.calls[0]!.callbacks.onCompleted?.(); await Promise.resolve();
  expect((await receipts.get(event.sessionId, event.eventId))?.status).toBe('playback_completed');
  await dispatchGuidedCue(db, event, { enabled: true, muted: false }, 'foreground');
  expect(player.calls).toHaveLength(1);
});

test('a current phase cue supersedes an obsolete countdown and finishing cancels outdated speech', async () => {
  const countdown = { ownerId: 'account-a', sessionId: 'session-priority', eventId: 'session-priority:countdown:run:10', kind: 'countdown' as const, text: '10 seconds remaining.', phaseId: runPhase.id, priority: 1 };
  await dispatchGuidedCue(db, countdown, { enabled: true, muted: false }, 'foreground');
  await dispatchGuidedCue(db, phaseCue('account-a', 'session-priority', runPhase), { enabled: true, muted: false }, 'foreground');
  expect(player.stops).toBe(1); expect(player.calls.at(-1)?.text).toContain('Run easy');
  await cancelGuidedCuesForFinish(db, 'account-a', 'session-priority');
  expect(player.stops).toBe(2);
  const receipt = await new GuidedCueEventRepository(db, 'account-a').get('session-priority', 'session-priority:phase:w1:run:1');
  expect(receipt).toMatchObject({ status: 'playback_superseded', errorCode: 'workout_finished' });
});

test('a successful resume confirmation supersedes an outdated pause announcement', async () => {
  await dispatchGuidedCue(db, cue('session-action-priority', 'pause'), { enabled: true, muted: false }, 'foreground');
  await dispatchGuidedCue(db, cue('session-action-priority', 'resume'), { enabled: true, muted: false }, 'foreground');
  expect(player.stops).toBe(1);
  expect(player.calls.map(item => item.text)).toEqual(['Workout paused.', 'Workout resumed.']);
  const old = await new GuidedCueEventRepository(db, 'account-a').get('session-action-priority', 'session-action-priority:pause:once');
  expect(old).toMatchObject({ status: 'playback_superseded', errorCode: 'superseded_by_current_cue' });
});

test('muting stops active speech, suppresses later cues, and unavailable or failed system TTS is receipted without throwing', async () => {
  const start = cue('session-mute'); await dispatchGuidedCue(db, start, { enabled: true, muted: false }, 'foreground');
  await dispatchGuidedCue(db, cue('session-mute', 'pause'), { enabled: true, muted: true }, 'foreground');
  expect(player.stops).toBe(1);
  const repo = new GuidedCueEventRepository(db, 'account-a');
  expect((await repo.get(start.sessionId, start.eventId))?.status).toBe('playback_superseded');
  player.available = false;
  const unavailable = cue('session-unavailable'); await expect(dispatchGuidedCue(db, unavailable, { enabled: true, muted: false }, 'foreground')).resolves.toBeUndefined();
  expect((await repo.get(unavailable.sessionId, unavailable.eventId))?.errorCode).toBe('system_tts_unavailable');
  player.available = true; player.fail = true;
  const failure = cue('session-failed'); await expect(dispatchGuidedCue(db, failure, { enabled: true, muted: false }, 'background')).resolves.toBeUndefined();
  expect((await repo.get(failure.sessionId, failure.eventId))?.errorCode).toBe('headless_speech_failed');
});

test('restart reconciliation fails pending receipts and never replays their cues', async () => {
  const event = cue('session-restart'); const repository = new GuidedCueEventRepository(db, 'account-a');
  await repository.claim(event, '2026-11-08T00:00:00Z'); await repository.update(event.sessionId, event.eventId, 'playback_attempted', '2026-11-08T00:00:01Z');
  await recoverGuidedCueReceipts(db, 'account-a', event.sessionId);
  expect((await repository.get(event.sessionId, event.eventId))?.errorCode).toBe('process_restarted_before_callback');
  await dispatchGuidedCue(db, event, { enabled: true, muted: false }, 'foreground'); expect(player.calls).toHaveLength(0);
});

test('voice preferences persist independently for each account with safe defaults', async () => {
  const a = new GuidedCuePreferencesRepository(db, 'account-a'); const b = new GuidedCuePreferencesRepository(db, 'account-b');
  expect(await a.get()).toEqual({ voiceEnabled: false, muted: false, countdownEnabled: false });
  await a.save({ voiceEnabled: false, muted: true, countdownEnabled: true }, '2026-11-08');
  expect(await a.get()).toEqual({ voiceEnabled: false, muted: true, countdownEnabled: true });
  expect(await b.get()).toEqual({ voiceEnabled: false, muted: false, countdownEnabled: false });
});
