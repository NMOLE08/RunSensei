import { LocalWeeklyPlanGenerationService, type PersonalizedWeekPreview } from '@/ai/services/LocalWeeklyPlanGenerationService';
import { buildPersonalizedRunnerContext } from '@/ai/services/RunnerProfileBuilder';
import type { PersonalizedTrainingPolicy, PersonalizedWeeklyInput } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import type { TrackerHistoryItem } from './trackerHistory';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { ActivityLog } from '@/domain/training/entities';
import { releaseReadiness, type PolicyReviewPackage } from '@/domain/training/policyReviewCatalog';

export type PersonalizedWeekRequest = { draft: OnboardingDraft; policy: PersonalizedTrainingPolicy; policyReviewPackage: PolicyReviewPackage; weekStartDate: string; phase: string; weekNumber: number; priorOutcomes: ActivityLog[] };

/** A runtime policy is usable only when its immutable review package approves this exact version. */
export function assertReviewedPolicyBinding(request: PersonalizedWeekRequest): void {
  const readiness = releaseReadiness(request.policyReviewPackage);
  if (!readiness.ready) throw new Error(`No reviewed policy is available for this runner (${readiness.reasons.join(', ')}).`);
  if (request.policy.id !== request.policyReviewPackage.id || request.policy.version !== request.policyReviewPackage.version) throw new Error('The runtime policy does not match the approved policy package.');
}

export function buildPersonalizedWeeklyInput(request: PersonalizedWeekRequest, nativeRuns: TrackerHistoryItem[], nowIso: string): PersonalizedWeeklyInput {
  if (request.draft.concernFlag) throw new Error('A health concern requires the separate review pathway before plan generation.');
  if (request.draft.recentInterruption === 'sustained') throw new Error('A sustained interruption requires reassessment before plan generation.');
  const minuteLimits = Object.fromEntries(request.draft.trainingDays.map((day) => [day, Number(request.draft.minuteLimits[day])]));
  if (request.draft.trainingDays.length === 0 || Object.values(minuteLimits).some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('Every available running day requires a positive whole-session time limit.');
  const context = buildPersonalizedRunnerContext(request.draft, nativeRuns, request.priorOutcomes, { nowIso, phase: request.phase, weekNumber: request.weekNumber });
  return { schemaVersion: 'personalized-weekly-input-v1', weekStartDate: request.weekStartDate, timezone: request.draft.timezone, runnerProfileFingerprint: context.fingerprint, runner: context.runner, goal: context.goal, trainingState: context.trainingState, availability: { runWeekdays: [...request.draft.trainingDays], maxSessionMinutesByWeekday: minuteLimits, unavailableDates: request.draft.unavailableDates.split(',').map((value) => value.trim()).filter(Boolean) }, paceEvidence: context.paceEvidence, policy: request.policy };
}

/** Actual on-device generation entry point. It never falls back to the deterministic demo generator. */
export async function generatePersonalizedWeekOnDevice(request: PersonalizedWeekRequest, dependencies: { generator?: LocalWeeklyPlanGenerationService; nativeRuns?: TrackerHistoryItem[]; now?: () => string } = {}): Promise<PersonalizedWeekPreview> {
  void request; void dependencies;
  throw new Error('Qwen no longer generates initial plans. Initial plans are deterministic System B output; Qwen may only provide a non-binding adjustment suggestion after workout feedback.');
}
