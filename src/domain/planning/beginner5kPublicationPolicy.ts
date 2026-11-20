import type { Experimental5kPreview } from '@/domain/research/experimental5kPreview';
import type { MultiDistanceTrainingPolicy, PolicyWorkoutStep } from './multiDistancePolicy';
import { bundledDraft5kProgramRegistry } from './draft5kProgramRegistry';
import { beginner5kContinuousCandidatePersonalizationPolicy } from './beginner5kPersonalizationPolicy';
import { beginner5kWorkloadCompatibilityV04 } from './beginner5kWorkloadCompatibilityPolicy';
import { beginner5kCalendarAvailability } from './beginner5kCalendarAvailability';
import { publicationCompatibilityReference } from './beginner5kPublicationArtifacts';
import { isVerifiedPolicyRelease, type VerifiedPolicyRelease } from './verifyPolicyRelease';

export function requiredBeginner5kPublicationReferences(preview: Experimental5kPreview): string[] {
  const refs = [beginner5kContinuousCandidatePersonalizationPolicy, beginner5kWorkloadCompatibilityV04, beginner5kCalendarAvailability];
  const pathway = beginner5kContinuousCandidatePersonalizationPolicy.pathways.find(p => p.id === preview.pathway.id && p.version === preview.pathway.version);
  return [...new Set([publicationCompatibilityReference, ...refs.map(p => `${p.policyId}@${p.version}`),
    ...(pathway ? [`${pathway.workoutPolicyPack.policyId}@${pathway.workoutPolicyPack.version}`, ...pathway.workoutPolicyPack.policyReferences] : []),
    `${preview.pathway.id}@${preview.pathway.version}`, ...preview.systemC.policyReferences,
    ...preview.sessions.flatMap(s => s.policyRefs)])].sort();
}

export function resolveBeginner5kPublicationPolicy(preview: Experimental5kPreview, release?: VerifiedPolicyRelease, evaluationTime = '') {
  const required = requiredBeginner5kPublicationReferences(preview);
  if (!isVerifiedPolicyRelease(release, required, evaluationTime)) return { kind: 'blocked' as const, blockers: required.map(reference => ({ reference, code: 'verified_policy_release_required' })) };
  const pathway = beginner5kContinuousCandidatePersonalizationPolicy.pathways.find(p => p.id === preview.pathway.id && p.version === preview.pathway.version);
  const program = pathway && bundledDraft5kProgramRegistry.resolve(pathway.workoutPolicyPack);
  if (!program || preview.candidateCompatibility.outcome !== 'candidate_compatible_draft_only' || preview.sessions.length !== 36 || !program.validate({ kind: 'draft_simulation', label: 'DRAFT POLICY SIMULATION — NOT FOR PRODUCTION', sessions: preview.sessions, policyRefs: preview.systemC.policyReferences }).valid) return { kind: 'blocked' as const, blockers: [{ reference: preview.pathway.id, code: 'program_validation_failed' }] };
  const policy: MultiDistanceTrainingPolicy = {
    id: `torto.publication.${preview.pathway.id}`, version: preview.pathway.version,
    goalFamily: '5k', lifecycle: 'release_ready', releaseAuthorized: true,
    supportedFrequency: [3], minimumRecoveryDays: 1, availabilityTimeRequirement: 'not_collected',
    sourceReferences: required, requiredEvidence: ['authorized_candidate_compatibility'], missingCapabilities: ['next_week_reassessment_authorization'],
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, phase: preview.sessions[i * 3]!.phase, recoveryWeek: i === 3 || i === 7, taper: i === 11,
      workouts: preview.sessions.filter(s => s.week === i + 1).map(s => ({ slot: s.code, role: s.steps.some(t => t.kind === 'event') ? 'event' : 'run', phase: s.phase, purpose: 'Authored beginner 5K workout', protected: true,
        target: s.durationSeconds === null ? { kind: 'distance_meters' as const, value: s.distanceMeters! } : { kind: 'duration_seconds' as const, value: s.durationSeconds }, steps: expandAuthored5kSteps(s.steps) })) })),
  };
  return { kind: 'authorized' as const, policy, requiredReferences: required };
}

/** Keep alternating run/walk pairs; the generic publisher must not group all running before walking. */
export function expandAuthored5kSteps(steps: Experimental5kPreview['sessions'][number]['steps']): PolicyWorkoutStep[] {
  const output: PolicyWorkoutStep[] = [];
  const emit = (step: typeof steps[number]) => output.push({ kind: step.kind === 'run' ? 'work' : step.kind === 'walk' ? 'recovery' : step.kind, instruction: step.kind === 'run' ? 'Run' : step.kind === 'walk' ? 'Walk for recovery' : step.kind === 'event' ? 'Complete 5K at comfortable effort; walking breaks allowed.' : `Walk ${step.kind}`, purpose: step.kind, effort: step.rpe, repeats: 1, target: step.seconds === null ? { kind: 'distance_meters', value: 5000 } : { kind: 'duration_seconds', value: step.seconds } });
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!; const next = steps[i + 1];
    if (step.kind === 'run' && next?.kind === 'walk' && step.repeats === next.repeats) { for (let n = 0; n < step.repeats; n++) { emit(step); emit(next); } i++; }
    else for (let n = 0; n < step.repeats; n++) emit(step);
  }
  return output;
}
