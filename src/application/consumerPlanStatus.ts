/** Presentation only. Callers must resolve authorization through the publication service. */
export type ConsumerPlanState = 'plan_ready' | 'preview_available' | 'more_information_needed' | 'reassessment_required' | 'schedule_conflict' | 'health_review_required' | 'program_not_supported' | 'policy_approval_pending' | 'production_authorization_failure' | 'plan_persistence_failure' | 'publication_conflict';
/**
 * Presentation-only recovery detail. The optional copy lets a caller explain a
 * specific blocker without changing the category, eligibility, or authorization.
 */
export type ConsumerPlanRecovery = {
  field: string;
  destination: string;
  /** The blocked state this copy was authored for. Mismatched copy is ignored. */
  category?: Exclude<ConsumerPlanState, 'plan_ready'>;
  title?: string;
  message?: string;
  actionLabel?: string;
};
export type ConsumerPlanStatusInput =
  | { kind: 'authorized_persisted_plan'; planId: string; policyReference: string; authorizationVerified: true }
  | { kind: Exclude<ConsumerPlanState, 'plan_ready'>; reasonCodes: readonly string[]; recovery?: ConsumerPlanRecovery };
const messages: Record<ConsumerPlanState, readonly [string, string, string]> = {
  publication_conflict: ['Your plan information changed', 'Refresh your plan status before trying again. Existing workouts have not been replaced.', '/plan'],
  production_authorization_failure: ['Plan authorization unavailable', 'Your plan could not be authorized. This is an internal issue; you do not need to repeat onboarding.', '/plan'],
  plan_persistence_failure: ['Your plan could not be saved', 'Please try again. Your saved running information is unchanged.', '/plan'],
  plan_ready: ['Your plan is ready', 'Open your saved training week.', '/plan'],
  preview_available: ['Your preview is available', 'Plan preview — not active yet.', '/plan'],
  more_information_needed: ['Let’s complete your running profile', 'We need a little more information to build your plan.', '/onboarding/assessment?returnTo=/plan'],
  reassessment_required: ['Let’s update your running level', 'Review what you can comfortably do today.', '/onboarding/assessment?returnTo=/plan'],
  schedule_conflict: ['Let’s adjust your training days', 'The available days do not fit this training schedule.', '/onboarding/availability?part=availability-days&returnTo=/plan'],
  health_review_required: ['Health review required', 'A reported concern requires review before training can proceed.', '/onboarding/running?part=running-interruption&returnTo=/plan'],
  program_not_supported: ['This plan is not available yet', 'There is not a supported pathway for this goal and profile.', '/plan'],
  policy_approval_pending: ['Plan activation unavailable', 'This plan cannot currently be activated because coaching authorization is unavailable. Your saved running information does not need to be repeated.', '/plan'],
};
export function consumerPlanStatus(input: ConsumerPlanStatusInput) {
  const code: ConsumerPlanState = input.kind === 'authorized_persisted_plan' ? 'plan_ready' : input.kind;
  if (input.kind === 'authorized_persisted_plan' && (!input.planId || !input.policyReference || input.authorizationVerified !== true)) throw new Error('verified_persisted_plan_required');
  const recovery = input.kind !== 'authorized_persisted_plan' ? input.recovery : undefined;
  const [defaultTitle, defaultMessage, defaultDestination] = messages[code];
  // A recovery may carry reason-specific runner copy, but only for the state
  // that authored it. Safety, schedule, program, and authorization copy must
  // never be replaced by a recovery from another category.
  const activeRecovery = recovery && (recovery.category === undefined || recovery.category === code) ? recovery : undefined;
  const title = activeRecovery?.title ?? defaultTitle;
  const message = activeRecovery?.message ?? defaultMessage;
  const destination = activeRecovery?.destination ?? defaultDestination;
  return { code, title, message, nextAction: { destination }, diagnostics: input.kind === 'authorized_persisted_plan' ? { planId: input.planId, policyReference: input.policyReference, reasonCodes: [] } : { reasonCodes: input.reasonCodes }, activePlan: code === 'plan_ready', recovery: activeRecovery };
}
