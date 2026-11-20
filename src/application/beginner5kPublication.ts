import { createExperimental5kPreview } from '@/domain/research/experimental5kPreview';
import { resolveBeginner5kPublicationPolicy, requiredBeginner5kPublicationReferences } from '@/domain/planning/beginner5kPublicationPolicy';
import { verifyPolicyRelease, type SignedPolicyApproval } from '@/domain/planning/verifyPolicyRelease';
import { evaluateBeginner5kProductionCompatibility } from '@/domain/planning/beginner5kProductionCompatibility';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import { schedulePolicyWeek } from '@/domain/planning/multiDistancePolicy';
import { publishAuthorizedPolicyWeek, type AuthorizedPolicyWeekRequest, type PublicationContext } from './publishAuthorizedPolicyWeek';
import type { TrainingRepository } from '@/data/repositories';

/** Internal boundary: only signatures verifiable against pinned release trust can authorize it. */
export async function publishBeginner5kInitialWeek(
  repository: TrainingRepository,
  input: Parameters<typeof createExperimental5kPreview>[0],
  request: Pick<AuthorizedPolicyWeekRequest, 'profile' | 'goal' | 'availability'>,
  context: PublicationContext,
  approvals: readonly SignedPolicyApproval[] = [],
) {
  // Capture one immutable logical request before cryptographic verification yields.
  input = JSON.parse(JSON.stringify(input)) as typeof input;
  request = JSON.parse(JSON.stringify(request)) as typeof request;
  approvals = approvals.map(a => ({ ...a }));
  if (!repository.isOwnedBy(input.ownerId) || input.draft.ownerId !== input.ownerId) return { kind: 'publication_error' as const, reasonCodes: ['publication_account_mismatch'] };
  if (request.goal.profileId !== request.profile.id || request.availability.profileId !== request.profile.id || request.profile.trainingTimezone !== input.draft.timezone || request.goal.distanceMeters !== 5000 || request.goal.startDate !== input.draft.planStartDate || request.goal.mode !== (input.draft.goalDateFixed ? 'fixed_date' : 'flexible') || request.goal.raceDate !== (input.draft.goalDateFixed ? input.draft.goalDate : null)) return { kind: 'publication_error' as const, reasonCodes: ['publication_input_mismatch'] };
  const preview = createExperimental5kPreview(input);
  if (preview.kind !== 'preview') return { kind: 'preview_blocked' as const, reasonCodes: preview.reasonCodes };
  const verified = await verifyPolicyRelease(approvals, requiredBeginner5kPublicationReferences(preview), context.now(), context.releaseTrust);
  if (verified.kind === 'blocked') return { kind: 'policy_approval_pending' as const, preview, blockers: [{ reference: 'release', code: verified.code }] };
  const compatibility = evaluateBeginner5kProductionCompatibility(input.draft, preview, verified.release, context.now());
  if (compatibility.kind === 'blocked') return { kind: 'compatibility_blocked' as const, reasonCodes: compatibility.reasonCodes };
  const authorization = resolveBeginner5kPublicationPolicy(preview, verified.release, context.now());
  if (authorization.kind !== 'authorized') return { kind: 'policy_approval_pending' as const, preview, blockers: authorization.blockers };
  const constraints = { ownerId: input.ownerId, goalFamily: '5k' as const, startDate: preview.scheduleAnchor as `${number}-${number}-${number}`, fixedGoalDate: null,
    availableDays: preview.feasibility.selectedWeekdays.map(weekday => ({ weekday, maxMinutes: null, confirmedByRunner: false })), unavailableDates: [] as `${number}-${number}-${number}`[], preferredLongRunDay: null };
  // Prove conversion preserves every original date and duration before any write.
  for (const week of authorization.policy.weeks) {
    const scheduled = schedulePolicyWeek(authorization.policy, constraints, week.week);
    const original = preview.sessions.filter(s => s.week === week.week);
    if (scheduled.kind !== 'scheduled' || scheduled.workouts.some((w, i) => w.date !== original[i]?.date || (w.target.kind === 'duration_seconds' && w.target.value !== original[i]?.durationSeconds))) return { kind: 'publication_error' as const, reasonCodes: ['authored_schedule_conversion_mismatch'] };
  }
  try {
    return await publishAuthorizedPolicyWeek(repository, new MultiDistancePolicyRegistry([authorization.policy]), {
      ...request, constraints, policyId: authorization.policy.id, policyVersion: authorization.policy.version,
      goalFamily: '5k', weekNumber: 1, inputFingerprint: preview.inputFingerprint,
      authorizationEvidence: { digest: verified.release.digestIdentity, artifactIds: verified.release.artifactIds },
      generationKey: `${input.ownerId}:5k:${preview.scheduleAnchor}:${preview.pathway.id}@${preview.pathway.version}:w1:${verified.release.digestIdentity}`,
    }, context);
  } catch(error) {
    if(error instanceof Error && ['publication_account_changed','publication_evidence_changed','publication_authorization_expired'].includes(error.message)) return {kind:'publication_error' as const,reasonCodes:[error.message]};
    return { kind: 'persistence_error' as const, reasonCodes: ['plan_persistence_failed'] };
  }
}

/** No reviewed transition rule is bundled. Calendar passage alone cannot authorize Week N+1. */
export function nextBeginner5kPublicationStatus() {
  return { kind: 'reassessment_required' as const, reasonCodes: ['next_week_progression_authorization_missing'] };
}
