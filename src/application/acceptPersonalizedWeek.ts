import type { PersonalizedWeekPreview } from '@/ai/services/LocalWeeklyPlanGenerationService';
import { validatePersonalizedWeeklyPlan, type PersonalizedWeeklyInput } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { TrainingRepository } from '@/data/repositories';
import { fingerprint } from '@/domain/context';
import type { Availability, LogicalSession, Plan, PlanRevision, PlanSnapshot, RaceGoal, RunnerProfile, SessionAssignment } from '@/domain/training/entities';

export type PersonalizedWeekActivationInput = { profile: RunnerProfile; goal: RaceGoal; availability: Availability; preview: PersonalizedWeekPreview; generationInput: PersonalizedWeeklyInput };
export type PersonalizedWeekActivationContext = { now(): string; id(prefix: string): string };

/** Revalidates and atomically activates a user-accepted Qwen week through the existing repository. */
export async function acceptPersonalizedWeek(repository: TrainingRepository, input: PersonalizedWeekActivationInput, context: PersonalizedWeekActivationContext): Promise<{ applied: boolean; snapshot: PlanSnapshot }> {
  if (input.preview.metadata.generator !== 'qwen3.5-2b') throw new Error('The preview is not a genuine Qwen generation result.');
  if (input.preview.metadata.contentStatus !== 'reviewed' || input.preview.metadata.generationMode !== 'production' || input.generationInput.generationMode === 'development_preview') throw new Error('Draft-policy previews are development-only and cannot be saved as a real plan.');
  if (!input.generationInput.policy.reviewed || input.preview.metadata.policyVersion !== input.generationInput.policy.version) throw new Error('The reviewed policy changed. Generate a fresh preview.');
  if (input.preview.metadata.runnerProfileFingerprint !== input.generationInput.runnerProfileFingerprint) throw new Error('The runner profile changed. Generate a fresh preview.');
  validatePersonalizedWeeklyPlan(input.preview.plan, input.generationInput);
  const timestamp = context.now(); const planId = `plan:${input.preview.id}`; const revisionId = `revision:${input.preview.id}`;
  const existing = await repository.getPlanSnapshot(planId);
  if (existing?.revision.id === revisionId) return { applied: false, snapshot: existing };
  const plan: Plan = { id: planId, goalId: input.goal.id, templateId: `ai:qwen3.5-2b:${input.generationInput.policy.id}`, mode: 'real', activeRevisionId: null, recommendationState: 'active', validationFingerprint: input.preview.metadata.runnerProfileFingerprint, createdAt: timestamp };
  const revision: PlanRevision = { id: revisionId, planId, parentRevisionId: null, engineVersion: 'local-ai-week-v1', templateVersion: input.preview.metadata.modelVersion, ruleVersion: input.preview.metadata.policyVersion, inputFingerprint: fingerprint({ runner: input.generationInput.runnerProfileFingerprint, plan: input.preview.plan, policy: input.generationInput.policy.version }), explanationJson: JSON.stringify({ generator: input.preview.metadata.generator, modelId: input.preview.metadata.modelId, modelVersion: input.preview.metadata.modelVersion, promptVersion: input.preview.metadata.promptVersion, policyVersion: input.preview.metadata.policyVersion, modelGeneratedAt: input.preview.metadata.generatedAt, validation: input.preview.metadata.validation, runnerProfileFingerprint: input.preview.metadata.runnerProfileFingerprint, rawGeneratedPlan: input.preview.plan, futureWeeksGenerated: false, selection: input.preview.plan.goalSummary }), createdAt: timestamp };
  const workoutDays = input.preview.plan.days.filter((day) => day.type !== 'rest');
  const logicalSessions: LogicalSession[] = workoutDays.map((day) => ({ id: `logical:${input.preview.id}:${day.date}`, planId, stableKey: `ai-week-${input.preview.plan.weekNumber}:${day.date}`, createdAt: timestamp }));
  const assignments: SessionAssignment[] = workoutDays.map((day, index) => ({ id: `assignment:${input.preview.id}:${day.date}`, logicalSessionId: logicalSessions[index].id, revisionId, plannedDate: day.date as `${number}-${number}-${number}`, phase: input.generationInput.trainingState.phase, role: day.type, prescriptionJson: JSON.stringify({ week: input.preview.plan.weekNumber, target: { ...(day.totalDurationMinutes !== null ? { durationSeconds: day.totalDurationMinutes * 60 } : {}), ...(day.totalDistanceMeters !== null && day.totalDistanceMeters > 0 ? { distanceMeters: day.totalDistanceMeters } : {}) }, purpose: day.purpose, effortCue: day.effortCue ?? 'Follow the reviewed effort guidance.', steps: day.steps.map((step) => ({ label: step.kind, instruction: `${step.purpose}. ${step.effortCue}${step.repeatCount > 1 ? ` Repeat ${step.repeatCount} times.` : ''}`, ...(step.target.kind === 'duration_minutes' ? { durationSeconds: step.target.value * step.repeatCount * 60 } : { distanceMeters: step.target.value * step.repeatCount }) })), approvedAlternatives: [], generator: input.preview.metadata.generator, policyRuleId: day.policyRuleId, coachingExplanation: day.coachingExplanation, paceTargetSecondsPerKm: day.paceTargetSecondsPerKm }) }));
  const snapshot: PlanSnapshot = { plan, revision, assignments };
  await repository.activateInitialPlan({ profile: input.profile, goal: input.goal, availability: input.availability, snapshot, logicalSessions, event: { id: `audit:${input.preview.id}`, actionType: 'qwen_week_accepted', relatedIdsJson: JSON.stringify([planId, revisionId, input.preview.id]), occurredAt: timestamp } });
  return { applied: true, snapshot };
}
