import { durationSeconds, type PolicyWorkoutStep, type ScheduledPolicyWorkout } from '@/domain/planning/multiDistancePolicy';
import type { ResearchBlock } from '@/domain/planning/researchFoundation';
import type { ComponentKind, PlannedWorkoutSnapshot } from '@/domain/performance/workoutCompletion';

export type GuidedPhase = {
  id: string;
  sourceStepIndex: number;
  repetition: number;
  kind: ComponentKind;
  instruction: string;
  purpose: string;
  effort: string | null;
  target: PolicyWorkoutStep['target'];
};
export type GuidedWorkoutSnapshot = {
  blockId: string;
  assignment: PlannedWorkoutSnapshot;
  workout: ScheduledPolicyWorkout;
  phases: readonly GuidedPhase[];
  snapshotFingerprint: string;
  researchOnly: true;
  productionEligible: false;
};
export type GuidedExecutionStatus = 'ready' | 'running' | 'paused' | 'interrupted' | 'finished';
export type GuidedPhaseCompletion = {
  phaseId: string;
  actualSeconds: number | null;
  completion: 'target_elapsed' | 'manual' | 'early_finish';
};
export type GuidedProgress = {
  status: GuidedExecutionStatus;
  phaseIndex: number;
  phaseStartedAtActiveSeconds: number;
  completedPhases: readonly GuidedPhaseCompletion[];
};

/** Resolve only the immutable workout snapshot whose stable assignment key matches. */
export function resolveGuidedWorkout(block: ResearchBlock, assignmentId: string): GuidedWorkoutSnapshot {
  if (!block.researchOnly || block.productionEligible || !block.ownerId) throw new Error('research_workout_not_authorized');
  const assignment = block.assignments.find(item => item.assignmentId === assignmentId);
  if (!assignment || assignment.planId !== block.id || assignment.revisionId !== block.id || assignment.logicalSessionId !== assignmentId) throw new Error('research_assignment_not_owned');
  const suffix = assignmentId.startsWith(`${block.id}:w`) ? assignmentId.slice(block.id.length + 2) : '';
  const match = /^(\d+):([A-Z])$/.exec(suffix);
  if (!match) throw new Error('research_assignment_snapshot_mismatch');
  const weekNumber = Number(match[1]);
  const slot = match[2]!;
  const workout = block.program.workouts.find(item => item.week === weekNumber && item.slot === slot);
  if (!workout || workout.date !== assignment.plannedDate || assignment.durationSeconds !== durationSeconds(workout.steps)) throw new Error('research_assignment_snapshot_mismatch');
  if (assignment.policyReferences.length !== 1 || assignment.policyReferences[0] !== block.program.policyReference) throw new Error('research_policy_reference_mismatch');
  const mappedSteps = workout.steps.map(step => ({ kind: componentKind(step), seconds: step.target.kind === 'duration_seconds' ? step.target.value : null, repeats: step.repeats }));
  if (JSON.stringify(mappedSteps) !== JSON.stringify(assignment.steps)) throw new Error('research_assignment_steps_mismatch');
  const phases = workout.steps.flatMap((step, sourceStepIndex) => Array.from({ length: step.repeats }, (_, repeatIndex) => ({
    id: `${assignmentId}:phase:${sourceStepIndex + 1}:${repeatIndex + 1}`,
    sourceStepIndex,
    repetition: repeatIndex + 1,
    kind: componentKind(step),
    instruction: step.instruction,
    purpose: step.purpose,
    effort: step.effort,
    target: { ...step.target },
  })));
  return {
    blockId: block.id,
    assignment: JSON.parse(JSON.stringify(assignment)) as PlannedWorkoutSnapshot,
    workout: JSON.parse(JSON.stringify(workout)) as ScheduledPolicyWorkout,
    phases,
    snapshotFingerprint: JSON.stringify([block.id, block.program.policyReference, assignment, workout]),
    researchOnly: true,
    productionEligible: false,
  };
}

export function initialGuidedProgress(): GuidedProgress {
  return { status: 'ready', phaseIndex: 0, phaseStartedAtActiveSeconds: 0, completedPhases: [] };
}

export function validateGuidedProgress(progress: GuidedProgress, phases: readonly GuidedPhase[]): boolean {
  if (!['ready', 'running', 'paused', 'interrupted', 'finished'].includes(progress.status)) return false;
  if (!Number.isInteger(progress.phaseIndex) || progress.phaseIndex < 0 || progress.phaseIndex > phases.length) return false;
  if (!Number.isFinite(progress.phaseStartedAtActiveSeconds) || progress.phaseStartedAtActiveSeconds < 0 || !Array.isArray(progress.completedPhases)) return false;
  const ids = new Set(phases.map(phase => phase.id)); const completed = new Set<string>();
  for (const item of progress.completedPhases) {
    if (!ids.has(item.phaseId) || completed.has(item.phaseId) || !Number.isFinite(item.actualSeconds) || item.actualSeconds < 0 || !['target_elapsed', 'manual', 'early_finish'].includes(item.completion)) return false;
    completed.add(item.phaseId);
  }
  return true;
}

/** Uses tracker active seconds, so recorded pause segments never consume phase time. */
export function reconcileGuidedProgress(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number): GuidedProgress {
  if (!Number.isFinite(activeSeconds) || activeSeconds < 0) throw new Error('invalid_active_elapsed_seconds');
  if (progress.status !== 'running') return progress;
  let next = progress;
  while (next.phaseIndex < phases.length) {
    const phase = phases[next.phaseIndex]!;
    if (phase.target.kind !== 'duration_seconds') break;
    const actualSeconds = Math.max(0, activeSeconds - next.phaseStartedAtActiveSeconds);
    if (actualSeconds < phase.target.value) break;
    next = {
      ...next,
      phaseIndex: next.phaseIndex + 1,
      phaseStartedAtActiveSeconds: next.phaseStartedAtActiveSeconds + phase.target.value,
      completedPhases: appendCompletion(next.completedPhases, { phaseId: phase.id, actualSeconds: phase.target.value, completion: 'target_elapsed' }),
    };
  }
  return next;
}

export function startGuidedProgress(progress: GuidedProgress): GuidedProgress {
  if (progress.status !== 'ready' && progress.status !== 'paused') throw new Error('guided_workout_cannot_start');
  return { ...progress, status: 'running' };
}

export function pauseGuidedProgress(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number): GuidedProgress {
  const reconciled = reconcileGuidedProgress(progress, phases, activeSeconds);
  if (reconciled.status !== 'running') return reconciled;
  return { ...reconciled, status: 'paused' };
}

export function interruptGuidedProgress(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number): GuidedProgress {
  const reconciled = reconcileGuidedProgress(progress, phases, activeSeconds);
  if (reconciled.status !== 'running') return reconciled;
  return { ...reconciled, status: 'interrupted' };
}

/** Untimed/distance phases require an explicit user confirmation; no target duration is inferred. */
export function completeUntimedPhase(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number): GuidedProgress {
  const reconciled = reconcileGuidedProgress(progress, phases, activeSeconds);
  const phase = phases[reconciled.phaseIndex];
  if (reconciled.status !== 'running' || !phase || phase.target.kind === 'duration_seconds') throw new Error('manual_completion_not_available');
  const actualSeconds = Math.max(0, activeSeconds - reconciled.phaseStartedAtActiveSeconds);
  return {
    ...reconciled,
    phaseIndex: reconciled.phaseIndex + 1,
    phaseStartedAtActiveSeconds: activeSeconds,
    completedPhases: appendCompletion(reconciled.completedPhases, { phaseId: phase.id, actualSeconds, completion: 'manual' }),
  };
}

/** Finishing early records only the elapsed portion and leaves later phases explicitly incomplete. */
export function finishGuidedProgress(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number): GuidedProgress {
  const reconciled = reconcileGuidedProgress(progress, phases, activeSeconds);
  if (reconciled.status === 'finished') return reconciled;
  const phase = phases[reconciled.phaseIndex];
  const currentSeconds = phase ? Math.max(0, activeSeconds - reconciled.phaseStartedAtActiveSeconds) : 0;
  const completedPhases = phase && currentSeconds > 0
    ? appendCompletion(reconciled.completedPhases, { phaseId: phase.id, actualSeconds: phase.target.kind === 'duration_seconds' ? Math.min(phase.target.value, currentSeconds) : currentSeconds, completion: 'early_finish' })
    : reconciled.completedPhases;
  return { ...reconciled, status: 'finished', completedPhases };
}

export function guidedPhaseView(progress: GuidedProgress, phases: readonly GuidedPhase[], activeSeconds: number) {
  const reconciled = reconcileGuidedProgress(progress, phases, activeSeconds);
  const current = phases[reconciled.phaseIndex] ?? null;
  const next = phases[reconciled.phaseIndex + 1] ?? null;
  const elapsedInPhaseSeconds = current ? Math.max(0, activeSeconds - reconciled.phaseStartedAtActiveSeconds) : 0;
  const remainingSeconds = current?.target.kind === 'duration_seconds' ? Math.max(0, current.target.value - elapsedInPhaseSeconds) : null;
  return {
    progress: reconciled,
    current,
    next,
    elapsedInPhaseSeconds,
    remainingSeconds,
    overallProgress: phases.length === 0 ? 1 : Math.min(1, reconciled.phaseIndex / phases.length),
    canManuallyComplete: reconciled.status === 'running' && current !== null && current.target.kind !== 'duration_seconds',
    allPhasesElapsed: reconciled.phaseIndex >= phases.length,
  } as const;
}

export type GuidedPhaseView = ReturnType<typeof guidedPhaseView>;

function appendCompletion(current: readonly GuidedPhaseCompletion[], value: GuidedPhaseCompletion): GuidedPhaseCompletion[] {
  return current.some(item => item.phaseId === value.phaseId) ? [...current] : [...current, value];
}

function componentKind(step: PolicyWorkoutStep): ComponentKind {
  switch (step.kind) {
    case 'work': return 'run';
    case 'recovery': return 'recovery';
    case 'warmup': return 'warmup';
    case 'cooldown': return 'cooldown';
    case 'event': return 'event';
  }
}
