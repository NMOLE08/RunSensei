import { actionCue, countdownCue, isCountdownCrossing, phaseCue, phaseTransitionBatch } from '@/domain/tracking/workoutCueEvents';
import type { GuidedPhase } from '@/domain/tracking/guidedWorkout';

const phase = (id: string, kind: GuidedPhase['kind'], target: GuidedPhase['target'] = { kind: 'duration_seconds', value: 60 }): GuidedPhase => ({ id, sourceStepIndex: 0, repetition: 1, kind, instruction: `${kind} instruction`, purpose: 'Test purpose', effort: 'Easy', target });

test('cue identities are session-scoped and phase transitions preserve phase content', () => {
  const warmup = phase('warmup-1', 'warmup');
  expect(actionCue('a', 's1', 'workout_start').eventId).toBe('s1:workout_start:once');
  expect(phaseCue('a', 's1', warmup)).toMatchObject({ eventId: 's1:phase:warmup-1', text: expect.stringContaining('warmup instruction') });
  expect(phaseCue('a', 's2', warmup).eventId).not.toBe(phaseCue('a', 's1', warmup).eventId);
});

test('a suspended phase jump speaks only the currently relevant phase and marks skipped cues stale', () => {
  const phases = [phase('a', 'warmup'), phase('b', 'run'), phase('c', 'recovery'), phase('d', 'cooldown')];
  expect(phaseTransitionBatch('owner', 'session', phases, 0, 3)).toMatchObject({ speak: { eventId: 'session:phase:d' }, suppress: [{ eventId: 'session:phase:b', reason: 'stale' }, { eventId: 'session:phase:c', reason: 'stale' }] });
  expect(phaseTransitionBatch('owner', 'session', phases, 0, 4)).toMatchObject({ speak: null, suppress: [{ eventId: 'session:phase:b' }, { eventId: 'session:phase:c' }, { eventId: 'session:phase:d' }] });
});

test('countdowns only apply to timed phases and only at a true threshold crossing', () => {
  const timed = phase('run', 'run', { kind: 'duration_seconds', value: 60 });
  const untimed = phase('event', 'event', { kind: 'distance_meters', value: 5000 });
  expect(countdownCue('owner', 'session', timed, 10)).toMatchObject({ eventId: 'session:countdown:run:10' });
  expect(countdownCue('owner', 'session', untimed, 10)).toBeNull();
  expect(isCountdownCrossing(11, 10, 10)).toBe(true);
  expect(isCountdownCrossing(10, 9, 10)).toBe(false);
  expect(isCountdownCrossing(12, null, 10)).toBe(false);
});
