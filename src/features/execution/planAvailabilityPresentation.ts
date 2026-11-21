import type { PlanAvailability } from '@/domain/assessment/planAvailability';
import { editPathForRequirement, requirementForAssessmentMissing } from '@/domain/assessment/onboardingRequirements';
import { consumerPlanStatus, type ConsumerPlanState } from '@/application/consumerPlanStatus';

export type PlanAvailabilityPresentation = Readonly<{
  title: string;
  explanation: string;
  actionLabel: string | null;
  actionPath: string | null;
}>;

/**
 * Converts the structured availability result into the small set of states a
 * runner sees. This is deliberately presentation-only: it neither changes an
 * assessment nor turns a draft preview into an active plan.
 */
export function consumerStatusForPlanAvailability(value: PlanAvailability) {
  if(value.consumerStatus)return value.consumerStatus;
  if (value.state === 'active_approved' && value.activeSnapshot) {
    const { plan, revision } = value.activeSnapshot;
    return consumerPlanStatus({
      kind: 'authorized_persisted_plan',
      planId: plan.id,
      policyReference: `${revision.templateVersion}@${revision.ruleVersion}`,
      authorizationVerified: true,
    });
  }

  let kind: Exclude<ConsumerPlanState, 'plan_ready'> = 'more_information_needed';
  if (value.assessment?.code === 'health_hold' || value.reasons.includes('assessment_health_hold')) kind = 'health_review_required';
  else if (value.assessment?.code === 'needs_reassessment' || value.assessment?.code === 'needs_base_build' || value.reasons.includes('assessment_needs_reassessment')) kind = 'reassessment_required';
  else if (value.reasons.includes('unsupported_two_day_schedule') || value.reasons.includes('unsupported_training_schedule')) kind = 'schedule_conflict';
  else if (value.reasons.includes('unsupported_goal_or_pathway') || value.reasons.includes('marathon_event_programme_not_authored')) kind = 'program_not_supported';
  else if (value.reasons.includes('draft_policy_not_release_ready')) kind = 'policy_approval_pending';
  return consumerPlanStatus({ kind, reasonCodes: value.reasons });
}

/** UI-only explanation layer. It never changes availability, assessment, or policy decisions. */
export function presentPlanAvailability(value: PlanAvailability): PlanAvailabilityPresentation {
  const assessment = value.assessment;
  if (assessment?.code === 'needs_reassessment') return {
    title: 'Update your running baseline',
    explanation: 'You reported a break of more than four weeks. Your earlier running history is still saved, but it is not treated as current repeatable capacity.',
    actionLabel: 'Review interruption', actionPath: '/onboarding/running?returnTo=/plan&focus=recent-interruption',
  };
  if (assessment?.code === 'needs_base_build') return {
    title: 'Build your running foundation',
    explanation: 'Your saved comfortable-running or longest-session evidence is below the existing draft entry condition. This is not a failed assessment and does not create an active plan.',
    actionLabel: 'Review current capacity', actionPath: '/onboarding/running?returnTo=/plan&focus=comfortable-running-minutes',
  };
  if (assessment?.code === 'insufficient_information') {
    const requirement = requirementForAssessmentMissing(assessment.missing);
    return {
      title: 'Add the information still needed',
      explanation: assessment.missing.length ? `Torto still needs: ${assessment.missing.join(', ')}.` : 'Some required runner information is incomplete.',
      actionLabel: requirement ? 'Add missing information' : 'Review starting point',
      actionPath: requirement ? editPathForRequirement(requirement) : '/onboarding/assessment?returnTo=/plan',
    };
  }
  if (assessment?.code === 'health_hold') return {
    title: 'Health review required',
    explanation: 'A reported pain, illness, or health-related interruption keeps coaching recommendations paused. Torto cannot provide medical clearance.',
    actionLabel: 'Review health information', actionPath: '/onboarding/running?returnTo=/plan&focus=health-concern',
  };
  if (value.reasons.includes('unsupported_two_day_schedule') || value.reasons.includes('unsupported_training_schedule')) return {
    title: 'Adjust your training availability',
    explanation: 'Your available days are saved. The currently bundled draft pathway has separate scheduling limits and does not author a new prescription for this pattern.',
    actionLabel: 'Review available days', actionPath: '/onboarding/availability?returnTo=/plan&focus=training-days',
  };
  if (value.reasons.includes('marathon_event_programme_not_authored')) return {
    title: 'Marathon event plan is not authored',
    explanation: 'Your marathon goal is saved, but Torto has no bundled marathon event-programme policy or generator. It will not reuse half-marathon workouts or invent a 42K schedule.',
    actionLabel: null, actionPath: null,
  };
  if (value.reasons.includes('unsupported_goal_or_pathway')) return {
    title: 'No supported draft pathway',
    explanation: 'Your goal and running information are saved, but no bundled draft pathway matches them. Torto will not invent a workout programme.',
    actionLabel: 'Review your goal', actionPath: '/onboarding/goal?returnTo=/plan&focus=goal',
  };
  if (value.reasons.includes('draft_policy_not_release_ready')) return {
    title: 'Draft coaching content is blocked',
    explanation: 'A matching draft pathway may exist, but it is not coach-reviewed or authorized as an active plan.',
    actionLabel: 'Review starting point', actionPath: '/onboarding/assessment?returnTo=/plan',
  };
  if (value.state === 'assessment_pending') return { title: 'Review your starting point', explanation: 'Your profile is saved. Record a current assessment before plan availability can be considered.', actionLabel: 'Review starting point', actionPath: '/onboarding/assessment?returnTo=/plan' };
  if (value.state === 'onboarding_incomplete') return { title: 'Complete your runner profile', explanation: 'Finish your saved runner information before Torto can assess plan availability.', actionLabel: 'Continue onboarding', actionPath: '/onboarding/running' };
  return { title: 'A training plan is not available yet', explanation: 'No active authorized training plan has been created for this account.', actionLabel: 'Review starting point', actionPath: '/onboarding/assessment?returnTo=/plan' };
}
