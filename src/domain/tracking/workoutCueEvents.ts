import type { GuidedPhase } from './guidedWorkout';

export type GuidedCueKind = 'workout_start' | 'phase_transition' | 'countdown' | 'pause' | 'resume' | 'workout_complete';
export type GuidedCueEvent = {
  ownerId: string;
  sessionId: string;
  eventId: string;
  kind: GuidedCueKind;
  text: string;
  phaseId: string | null;
  priority: number;
};

export type CueSuppression = { eventId: string; kind: GuidedCueKind; phaseId: string | null; reason: 'stale' | 'muted' | 'disabled' };

export function actionCue(ownerId: string, sessionId: string, kind: 'workout_start' | 'pause' | 'resume' | 'workout_complete', transitionKey = 'once'): GuidedCueEvent {
  const text: Record<typeof kind, string> = {
    workout_start: 'Workout started.',
    pause: 'Workout paused.',
    resume: 'Workout resumed.',
    workout_complete: 'Workout complete.',
  };
  const priority = kind === 'workout_complete' ? 7 : kind === 'pause' || kind === 'resume' ? 6 : 4;
  return { ownerId, sessionId, eventId: `${sessionId}:${kind}:${transitionKey}`, kind, text: text[kind], phaseId: null, priority };
}

export function phaseCue(ownerId: string, sessionId: string, phase: GuidedPhase): GuidedCueEvent {
  const label = phase.kind === 'warmup' ? 'Warm-up' : phase.kind === 'cooldown' ? 'Cool-down' : phase.kind === 'recovery' || phase.kind === 'walk' ? 'Recovery' : phase.kind === 'event' ? 'Event' : 'Run';
  const details = [phase.instruction, phase.effort ? `Effort: ${phase.effort}.` : null].filter(Boolean).join('. ');
  return {
    ownerId, sessionId, eventId: `${sessionId}:phase:${phase.id}`, kind: 'phase_transition',
    text: `${label}. ${details}`.trim(), phaseId: phase.id, priority: 4,
  };
}

export function countdownCue(ownerId: string, sessionId: string, phase: GuidedPhase, thresholdSeconds: number): GuidedCueEvent | null {
  if (phase.target.kind !== 'duration_seconds' || !Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0 || phase.target.value <= thresholdSeconds) return null;
  return { ownerId, sessionId, eventId: `${sessionId}:countdown:${phase.id}:${thresholdSeconds}`, kind: 'countdown', text: `${thresholdSeconds} seconds remaining.`, phaseId: phase.id, priority: 1 };
}

/** For a multi-phase elapsed-time jump, only the latest relevant phase is spoken. */
export function phaseTransitionBatch(ownerId: string, sessionId: string, phases: readonly GuidedPhase[], previousIndex: number, currentIndex: number) {
  if (currentIndex <= previousIndex) return { speak: null as GuidedCueEvent | null, suppress: [] as CueSuppression[] };
  const skipped = phases.slice(Math.max(0, previousIndex + 1), Math.max(0, currentIndex));
  const suppress = skipped.map(phase => ({ eventId: `${sessionId}:phase:${phase.id}`, kind: 'phase_transition' as const, phaseId: phase.id, reason: 'stale' as const }));
  if (currentIndex >= phases.length) return { speak: null, suppress };
  return { speak: phaseCue(ownerId, sessionId, phases[currentIndex]!), suppress };
}

export function isCountdownCrossing(previousRemaining: number | null, remaining: number | null, thresholdSeconds: number): boolean {
  return previousRemaining !== null && remaining !== null && previousRemaining > thresholdSeconds && remaining <= thresholdSeconds && remaining > 0;
}
