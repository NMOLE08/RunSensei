import { researchBlock } from '../support/researchFoundationFixtures';
import { completeUntimedPhase, finishGuidedProgress, guidedPhaseView, initialGuidedProgress, interruptGuidedProgress, pauseGuidedProgress, reconcileGuidedProgress, resolveGuidedWorkout, startGuidedProgress, type GuidedPhase } from '@/domain/tracking/guidedWorkout';

it('resolves the exact saved assignment snapshot into ordered authored phases', () => {
  const block = researchBlock();
  const assignment = block.assignments[0]!;
  const guided = resolveGuidedWorkout(block, assignment.assignmentId);
  expect(guided).toMatchObject({ blockId: block.id, researchOnly: true, productionEligible: false, assignment });
  expect(guided.phases.map(phase => phase.kind)).toEqual(['warmup', 'run', 'cooldown']);
  expect(guided.phases.map(phase => phase.target)).toEqual(block.program.workouts[0]!.steps.map(step => step.target));
  expect(guided.phases[1]).toMatchObject({ instruction: 'Run at a comfortable conversational effort', effort: 'Easy conversational effort; stop for concerning symptoms' });
});

it('expands step repetitions deterministically and reconciles multiple elapsed phase boundaries', () => {
  const block = researchBlock();
  const source = block.program.workouts[0]!;
  const repeated = { ...source, steps: source.steps.map((step, index) => index === 1 ? { ...step, repeats: 3 } : step) };
  const repeatedBlock = { ...block, program: { ...block.program, workouts: [repeated, ...block.program.workouts.slice(1)] } };
  const assigned = { ...block.assignments[0]!, durationSeconds: source.steps[0]!.target.kind === 'duration_seconds' && source.steps[1]!.target.kind === 'duration_seconds' && source.steps[2]!.target.kind === 'duration_seconds' ? source.steps[0]!.target.value + source.steps[1]!.target.value * 3 + source.steps[2]!.target.value : null,
    steps: [block.assignments[0]!.steps[0]!, { ...block.assignments[0]!.steps[1]!, repeats: 3 }, block.assignments[0]!.steps[2]!] };
  repeatedBlock.assignments = [assigned, ...block.assignments.slice(1)];
  const guided = resolveGuidedWorkout(repeatedBlock, assigned.assignmentId);
  expect(guided.phases.filter(phase => phase.sourceStepIndex === 1).map(phase => phase.repetition)).toEqual([1, 2, 3]);
  let state = startGuidedProgress(initialGuidedProgress());
  state = reconcileGuidedProgress(state, guided.phases, 300 + 1000 * 3);
  expect(state.phaseIndex).toBe(4);
  expect(state.completedPhases.map(item => item.completion)).toEqual(['target_elapsed', 'target_elapsed', 'target_elapsed', 'target_elapsed']);
});

it('excludes paused elapsed time and reconciles screen-lock jumps through active tracker time', () => {
  const block = researchBlock(); const guided = resolveGuidedWorkout(block, block.assignments[0]!.assignmentId);
  let progress = startGuidedProgress(initialGuidedProgress());
  progress = reconcileGuidedProgress(progress, guided.phases, 300);
  expect(progress.phaseIndex).toBe(1);
  progress = pauseGuidedProgress(progress, guided.phases, 300);
  // Twenty minutes of wall time while paused never changes the active counter.
  progress = startGuidedProgress(progress);
  progress = reconcileGuidedProgress(progress, guided.phases, 300 + 1000);
  expect(progress.phaseIndex).toBe(2);
  expect(guidedPhaseView(progress, guided.phases, 300 + 1000)).toMatchObject({ current: guided.phases[2], remainingSeconds: 300, overallProgress: 2 / 3 });
  // A single foreground update can cross several steps; the result is deterministic.
  progress = reconcileGuidedProgress(progress, guided.phases, 300 + 1000 + 300);
  expect(progress.phaseIndex).toBe(3);
});

it('requires a manual action for untimed/distance phases and preserves unknown targets', () => {
  const phases: GuidedPhase[] = [
    { id: 'warm', sourceStepIndex: 0, repetition: 1, kind: 'warmup', instruction: 'Walk', purpose: 'Prepare', effort: 'Easy', target: { kind: 'duration_seconds', value: 10 } },
    { id: 'event', sourceStepIndex: 1, repetition: 1, kind: 'event', instruction: 'Complete the event', purpose: 'Finish', effort: null, target: { kind: 'distance_meters', value: 5000 } },
    { id: 'cool', sourceStepIndex: 2, repetition: 1, kind: 'cooldown', instruction: 'Walk', purpose: 'Recover', effort: 'Easy', target: { kind: 'unknown' } },
  ];
  let progress = startGuidedProgress(initialGuidedProgress());
  progress = reconcileGuidedProgress(progress, phases, 10);
  expect(guidedPhaseView(progress, phases, 10)).toMatchObject({ canManuallyComplete: true, remainingSeconds: null, next: phases[2] });
  expect(() => reconcileGuidedProgress(progress, phases, 500)).not.toThrow();
  progress = completeUntimedPhase(progress, phases, 70);
  expect(progress.completedPhases.at(-1)).toEqual({ phaseId: 'event', actualSeconds: 60, completion: 'manual' });
  const cooldown = completeUntimedPhase(progress, phases, 70);
  expect(cooldown.completedPhases.at(-1)).toEqual({ phaseId: 'cool', actualSeconds: 0, completion: 'manual' });
  expect(() => completeUntimedPhase(cooldown, phases, 70)).toThrow('manual_completion_not_available');
});

it('records early finish as actual partial execution and never fills unreached phases', () => {
  const phases: GuidedPhase[] = [
    { id: 'run', sourceStepIndex: 0, repetition: 1, kind: 'run', instruction: 'Run', purpose: 'Work', effort: 'Easy', target: { kind: 'duration_seconds', value: 60 } },
    { id: 'walk', sourceStepIndex: 1, repetition: 1, kind: 'recovery', instruction: 'Walk', purpose: 'Recover', effort: 'Easy', target: { kind: 'duration_seconds', value: 30 } },
  ];
  const progress = finishGuidedProgress(startGuidedProgress(initialGuidedProgress()), phases, 25);
  expect(progress).toMatchObject({ status: 'finished', phaseIndex: 0 });
  expect(progress.completedPhases).toEqual([{ phaseId: 'run', actualSeconds: 25, completion: 'early_finish' }]);
});

it('keeps interrupted progress distinct and rejects tampered assignment snapshots', () => {
  const block = researchBlock(); const guided = resolveGuidedWorkout(block, block.assignments[0]!.assignmentId);
  const interrupted = interruptGuidedProgress(startGuidedProgress(initialGuidedProgress()), guided.phases, 75);
  expect(interrupted.status).toBe('interrupted');
  expect(() => startGuidedProgress(interrupted)).toThrow('guided_workout_cannot_start');
  expect(() => resolveGuidedWorkout(block, 'foreign:w1:A')).toThrow('research_assignment_not_owned');
  const changed = structuredClone(block); changed.assignments[0]!.steps[1]!.seconds = 17;
  expect(() => resolveGuidedWorkout(changed, changed.assignments[0]!.assignmentId)).toThrow('research_assignment_steps_mismatch');
});
