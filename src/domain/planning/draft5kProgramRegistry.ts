import { continuous5kWorkoutPolicyPack, simulateContinuous5kDraft, validateContinuous5kDraftSimulation } from './continuous5kPolicyPack';
import { first5kWorkoutPolicyPack, simulateFirst5kDraft } from './first5kPolicyPack';
import { validateFirst5kDraftSimulation, type First5kSafetyValidation } from './first5kSafetyValidator';
import type { WorkoutPolicyPackReference } from './beginner5kPersonalizationPolicy';
import type { First5kSimulation } from './first5kPolicyPack';

export type Draft5kWorkoutProgram = {
  workoutPolicyPack: WorkoutPolicyPackReference;
  simulate: (startDate: string, availableDays: number[], healthConcern?: boolean) => First5kSimulation;
  validate: (simulation: First5kSimulation, options?: { healthConcern?: boolean; unavailableDates?: string[] }) => First5kSafetyValidation;
};

const programs: readonly Draft5kWorkoutProgram[] = [
  { workoutPolicyPack: first5kWorkoutPolicyPack, simulate: simulateFirst5kDraft, validate: validateFirst5kDraftSimulation },
  { workoutPolicyPack: continuous5kWorkoutPolicyPack, simulate: simulateContinuous5kDraft, validate: validateContinuous5kDraftSimulation },
];

export class Draft5kProgramRegistry {
  resolve(reference: WorkoutPolicyPackReference): Draft5kWorkoutProgram | null {
    return programs.find((program) => samePack(program.workoutPolicyPack, reference)) ?? null;
  }
}
export const bundledDraft5kProgramRegistry = new Draft5kProgramRegistry();
function samePack(left: WorkoutPolicyPackReference, right: WorkoutPolicyPackReference) { return left.policyId === right.policyId && left.version === right.version && left.policyReferences.length === right.policyReferences.length && left.policyReferences.every((item, index) => item === right.policyReferences[index]); }
