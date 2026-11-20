import { TrainingRepository } from '@/data/repositories';
import type { Availability, LogicalSession, Plan, PlanRevision, PlanSnapshot, RaceGoal, RunnerProfile, SessionAssignment } from '@/domain/training/entities';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { policyReference, schedulePolicyWeek, type GoalFamily, type MultiDistanceRunnerConstraints } from '@/domain/planning/multiDistancePolicy';
import type { VerifiedReleaseTrust } from '@/services/security/releaseTrust';

export type AuthorizedPolicyWeekRequest = { policyId: string; policyVersion: string; goalFamily: GoalFamily; weekNumber: number; profile: RunnerProfile; goal: RaceGoal; availability: Availability; constraints: MultiDistanceRunnerConstraints; inputFingerprint: string; generationKey: string; authorizationEvidence?: { digest: string; artifactIds: readonly string[] } };
export type PublicationContext = { now(): string; id(prefix: string): string; allowTestPolicies?: boolean; releaseTrust?: VerifiedReleaseTrust; assertPublicationCurrent?: () => Promise<void> };
export type PolicyWeekPublication = { kind: 'published'; applied: boolean; snapshot: PlanSnapshot } | { kind: 'blocked'; reasonCodes: readonly string[] };

/** Application boundary: exact authorized policy -> independently scheduled week -> one atomic SQLite transaction. */
export async function publishAuthorizedPolicyWeek(repository: TrainingRepository, registry: MultiDistancePolicyRegistry, request: AuthorizedPolicyWeekRequest, context: PublicationContext): Promise<PolicyWeekPublication> {
  request = JSON.parse(JSON.stringify(request)) as AuthorizedPolicyWeekRequest;
  if (!repository.isOwnedBy(request.constraints.ownerId)) return { kind: 'blocked', reasonCodes: ['publication_account_mismatch'] };
  if (request.weekNumber !== 1) return { kind: 'blocked', reasonCodes: ['initial_publication_requires_week_one'] };
  const resolved = registry.resolve(request.policyId, request.policyVersion, request.goalFamily, true);
  if (resolved.kind === 'unavailable') return { kind: 'blocked', reasonCodes: [resolved.code] };
  const policy = resolved.policy;
  if (policy.testOnly && !context.allowTestPolicies) return { kind: 'blocked', reasonCodes: ['test_policy_not_available_to_application'] };
  const schedule = schedulePolicyWeek(policy, request.constraints, request.weekNumber);
  if (schedule.kind === 'blocked') return { kind: 'blocked', reasonCodes: schedule.reasonCodes };
  const planId = `plan:policy:${JSON.stringify([request.constraints.ownerId, request.generationKey, request.policyId, request.policyVersion, request.weekNumber])}`;
  const now = context.now(); const revisionId = `revision:${planId}:initial`;
  const profile = { ...request.profile, id: `profile:${planId}` };
  const goal = { ...request.goal, id: `goal:${planId}`, profileId: profile.id };
  const availability = { ...request.availability, id: `availability:${planId}`, profileId: profile.id };
  const plan: Plan = { id: planId, goalId: goal.id, templateId: policyReference(policy), mode: 'real', activeRevisionId: null, recommendationState: 'active', validationFingerprint: request.inputFingerprint, createdAt: now };
  const revision: PlanRevision = { id: revisionId, planId, parentRevisionId: null, engineVersion: 'multi-distance-policy-engine-v1', templateVersion: policy.version, ruleVersion: policy.version, inputFingerprint: request.inputFingerprint, explanationJson: JSON.stringify({ generator: 'deterministic_policy_engine', policy: policyReference(policy), sourceReferences: policy.sourceReferences, authorizationEvidence: request.authorizationEvidence, week: request.weekNumber, researchOnly: false, policyAuthorized: true, testOnly: policy.testOnly === true }), createdAt: now };
  const logicalSessions: LogicalSession[] = schedule.workouts.map((workout) => ({ id: `logical:${planId}:${workout.date}:${workout.slot}`, planId, stableKey: `week-${request.weekNumber}:${workout.date}:${workout.slot}`, createdAt: now }));
  const assignments: SessionAssignment[] = schedule.workouts.map((workout, index) => ({
    id: `assignment:${planId}:${workout.date}:${workout.slot}`,
    logicalSessionId: logicalSessions[index]!.id, revisionId, plannedDate: workout.date, phase: workout.phase, role: workout.role,
    prescriptionJson: JSON.stringify({
      target: workout.target.kind === 'duration_seconds' ? { durationSeconds: workout.target.value } : workout.target.kind === 'distance_meters' ? { distanceMeters: workout.target.value } : {},
      purpose: workout.purpose, effortCue: workout.steps.map((step) => step.effort).filter(Boolean).join(' · ') || 'Follow the policy guidance.',
      steps: workout.steps.map((step) => ({ label: step.kind, instruction: step.instruction, durationSeconds: step.target.kind === 'duration_seconds' ? step.target.value * step.repeats : undefined, distanceMeters: step.target.kind === 'distance_meters' ? step.target.value * step.repeats : undefined })),
      approvedAlternatives: [], policyReferences: [...new Set([...workout.policyReferences, ...policy.sourceReferences])],
    }),
  }));
  const snapshot: PlanSnapshot = { plan, revision, assignments };
  try {
    const saved = await repository.publishInitialPlanOnce({ profile, goal, availability, snapshot, logicalSessions, assertPublicationCurrent: context.assertPublicationCurrent, event: { id: `audit:${planId}`, actionType: 'authorized_policy_week_published', relatedIdsJson: JSON.stringify([planId, revisionId, policyReference(policy), request.profile.id, request.goal.id, request.availability.id]), occurredAt: now } });
    return { kind: 'published', ...saved };
  } catch (error) {
    if (error instanceof Error && error.message === 'publication_revision_conflict') return { kind: 'blocked', reasonCodes: ['publication_revision_conflict'] };
    throw error;
  }
}
