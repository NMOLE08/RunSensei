import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import { buildMultiDistancePlanningInput } from './multiDistancePlanningInput';
import { schedulePolicyWeek, validateMultiDistancePolicy, type GoalFamily, type MultiDistanceTrainingPolicy, type PolicyWorkout, type ScheduledPolicyWorkout } from '@/domain/planning/multiDistancePolicy';

export type EventDistanceCandidate =
  | Readonly<{ kind: 'plan'; goalFamily: '10k' | 'marathon'; title: string; policy: MultiDistanceTrainingPolicy; weeks: readonly { week: number; workouts: readonly ScheduledPolicyWorkout[]; recoveryWeek: boolean; taper: boolean }[]; validation: { valid: true; issues: readonly [] } }>
  | Readonly<{ kind: 'blocked'; goalFamily: '10k' | 'marathon'; reasonCodes: readonly string[] }>;

export function generateEventDistanceCandidate(draft: FitnessAssessmentDraft, assessment: FitnessAssessmentResult): EventDistanceCandidate | null {
  if (draft.goal !== '10k' && draft.goal !== 'marathon') return null;
  const goalFamily = draft.goal;
  const blocked = (...reasonCodes: string[]): EventDistanceCandidate => ({ kind: 'blocked', goalFamily, reasonCodes });
  if (draft.trainingObjective !== 'finish') return blocked('finish_objective_required');
  if (draft.currentTrainingStatus !== 'currently_training') return blocked('current_training_required');
  if (!draft.currentCapabilityConfirmedAt) return blocked('current_capacity_not_confirmed');
  const planning = buildMultiDistancePlanningInput(draft, assessment);
  if (planning.kind === 'blocked') return blocked(...planning.reasonCodes);
  const policy = goalFamily === '10k' ? create10kCandidatePolicy() : createMarathonCandidatePolicy();
  const entry = entryBlockers(goalFamily, planning.evidence.weeklyMinutes, planning.evidence.longestSessionMinutes, planning.evidence.comfortableRunMinutes, planning.constraints.availableDays.length);
  if (entry.length) return blocked(...entry);
  const policyIssues = validateMultiDistancePolicy(policy);
  if (policyIssues.length) return blocked('invalid_candidate_policy', ...policyIssues);
  const weeks: { week: number; workouts: readonly ScheduledPolicyWorkout[]; recoveryWeek: boolean; taper: boolean }[] = [];
  for (const policyWeek of policy.weeks) {
    const scheduled = schedulePolicyWeek(policy, planning.constraints, policyWeek.week, { researchOnly: true });
    if (scheduled.kind === 'blocked') return blocked(...scheduled.reasonCodes);
    weeks.push({ week: policyWeek.week, workouts: scheduled.workouts, recoveryWeek: policyWeek.recoveryWeek, taper: policyWeek.taper });
  }
  return { kind: 'plan', goalFamily, title: goalFamily === '10k' ? '12-week 10K plan' : '18-week marathon plan', policy, weeks, validation: { valid: true, issues: [] } };
}

function entryBlockers(goal: '10k' | 'marathon', weekly: number | null, longest: number | null, comfortable: number | null, days: number): string[] {
  const requirements = goal === '10k'
    ? { weekly: 120, longest: 40, comfortable: 30, days: 4 }
    : { weekly: 180, longest: 40, comfortable: 40, days: 4 };
  const reasons: string[] = [];
  if (weekly === null || weekly < requirements.weekly) reasons.push('weekly_running_below_candidate_entry');
  if (longest === null || longest < requirements.longest) reasons.push('longest_session_below_candidate_entry');
  if (comfortable === null || comfortable < requirements.comfortable) reasons.push('comfortable_running_below_candidate_entry');
  if (days < requirements.days) reasons.push('four_training_days_required');
  return reasons;
}

export function create10kCandidatePolicy(): MultiDistanceTrainingPolicy {
  // Running-only core sessions from the supplied conservative schedule. The
  // optional strength/cross-training columns are not silently converted into runs.
  const quality = [50, 62, 40, 71, 55, 62, 55, 74, 55, 55, 42, 30];
  const tempo = [45, 45, 45, 50, 55, 45, 50, 40, 50, 50, 40, 20];
  const easy = [23, 26, 36, 28, 27, 26, 28, 24, 28, 28, 28, 14];
  const long: (number | { eventMeters: number; label: string })[] = [40, 50, 50, { eventMeters: 5_000, label: '5K time trial or race' }, 60, 50, 60, { eventMeters: 8_000, label: '8K / 5-mile time trial or race' }, 60, 50, 40, { eventMeters: 10_000, label: '10K goal event' }];
  return policy('torto.10k.conservative', '1.0.0-review-candidate', '10k', quality.map((minutes, index) => {
    const week = index + 1;
    return {
      week, phase: phase(week, 12), recoveryWeek: [4, 8].includes(week), taper: week === 12,
      workouts: [
        timed('quality', minutes, 'Speed session including the source warm-up, work, recovery, and easy running.', 'RPE 7-8'),
        timed('tempo', tempo[index]!, 'Tempo session including source warm-up, sustained running, and easy running.', 'RPE 6-7'),
        timed('easy', easy[index]!, 'Easy running with the scheduled relaxed strides and recovery jogs.', 'easy'),
        typeof long[index] === 'number' ? timed('long', long[index], 'Long conversational run.', 'RPE 5') : event(`event-${week}`, long[index].eventMeters, `${long[index].label}. Include the source warm-up and cool-down.`),
      ],
    };
  }), ['nyrr-10k-conservative-v1']);
}

export function createMarathonCandidatePolicy(): MultiDistanceTrainingPolicy {
  // The source contains duration ranges. This conservative candidate uses the
  // lower bound and retains the range in the workout description for review.
  const optional = [20, 0, 20, 20, 20, 20, 40, 0, 40, 40, 45, 20, 45, 45, 45, 45, 0, 0];
  const quality = [20, 35, 30, 30, 40, 40, 40, 40, 40, 45, 45, 45, 40, 45, 45, 40, 40, 30];
  const easy = [30, 35, 30, 30, 30, 40, 40, 45, 30, 30, 45, 45, 45, 45, 45, 45, 30, 20];
  const long = [40, 50, 60, 60, 70, 80, 90, 60, 100, 110, 120, 90, 135, 150, 165, 75, 60, null];
  return policy('torto.marathon.conservative', '1.0.0-review-candidate', 'marathon', quality.map((minutes, index) => {
    const week = index + 1;
    const workouts: PolicyWorkout[] = [];
    if (optional[index]! > 0) workouts.push(timed('easy-a', optional[index]!, week >= 11 && week <= 16 ? 'Easy conversational running; source range is 45–60 minutes and this candidate uses its conservative lower bound.' : 'Easy conversational running.', 'easy'));
    workouts.push(timed('quality', minutes, week >= 11 && week <= 16 ? 'Controlled quality session; source range is 40/45–60 minutes and this candidate uses its conservative lower bound.' : 'Controlled quality session using the authored weekly duration.', 'controlled'));
    workouts.push(timed('easy-b', easy[index]!, week >= 11 && week <= 16 ? 'Regular conversational run; source range is 45–60 minutes and this candidate uses its conservative lower bound.' : 'Regular conversational run.', 'easy'));
    workouts.push(long[index] === null ? event('marathon-event', 42_195, 'Complete the marathon event at a self-selected effort.') : timed('long', long[index]!, 'Long conversational run.', 'easy'));
    return { week, phase: phase(week, 18), recoveryWeek: [8, 12, 16].includes(week), taper: week >= 16, workouts };
  }), ['nyrr-marathon-conservative-v1']);
}

function policy(id: string, version: string, goalFamily: GoalFamily, weeks: MultiDistanceTrainingPolicy['weeks'], sourceReferences: readonly string[]): MultiDistanceTrainingPolicy {
  return { id, version, goalFamily, lifecycle: 'under_review', releaseAuthorized: false, supportedFrequency: [3, 4], minimumRecoveryDays: 0, availabilityTimeRequirement: 'not_collected', sourceReferences, requiredEvidence: ['current_weekly_minutes', 'current_longest_session_minutes', 'comfortable_run_minutes', 'current_capacity_confirmation', 'available_days'], missingCapabilities: ['final_trainer_hash_and_signature', 'automatic_adaptation'], weeks };
}

function timed(role: string, minutes: number, purpose: string, effort: string): PolicyWorkout {
  const target = { kind: 'duration_seconds' as const, value: minutes * 60 };
  return { slot: role, role: role.startsWith('easy') ? 'easy' : role, phase: 'training', purpose, target, protected: role === 'long', steps: [{ kind: 'work', instruction: purpose, purpose: role, effort, target, repeats: 1 }] };
}

function event(slot: string, distanceMeters: number, instruction: string): PolicyWorkout {
  const target = { kind: 'distance_meters' as const, value: distanceMeters };
  return { slot, role: 'event', phase: 'event', purpose: instruction, target, protected: true, steps: [{ kind: 'event', instruction, purpose: 'event', effort: null, target, repeats: 1 }] };
}

function phase(week: number, total: number): string { return week === total ? 'event' : week >= total - 2 ? 'taper' : week <= 4 ? 'base' : 'development'; }
