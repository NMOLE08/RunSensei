import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { applyAdjustment } from '@/application/applyAdjustment';
import { refreshActivePlanReminders } from '@/application/reminderRefresh';
import { proposeAdjustment, type AdjustmentResult } from '@/domain/training/adjustment';
import { bundledTemplateCatalog } from '@/domain/training/templateCatalog';
import type { AdjustmentProposal, PlanSnapshot, UnitSystem } from '@/domain/training/entities';
import type { PlanningAvailability, PlanningGoal } from '@/domain/training/content';
import { localDateOnly } from '@/features/execution/viewModel';
import { requireActiveAccountId } from './localAccount';

export interface PlanReviewView { snapshot: PlanSnapshot; result: AdjustmentResult; proposalId: string; units: UnitSystem; }

async function review(repository: TrainingRepository, persist: boolean): Promise<PlanReviewView> {
  const execution = await repository.getActiveExecution(); if (!execution) throw new Error('No active plan is available for review.'); const { snapshot } = execution;
  if (snapshot.plan.mode !== 'demo') throw new Error('Reviewed adjustment content is not available for this plan.');
  const content = bundledTemplateCatalog.resolve(snapshot.plan.templateId, snapshot.revision.templateVersion, snapshot.revision.ruleVersion);
  if (content.kind === 'unavailable') throw new Error(content.message);
  const inputs = await repository.getReviewInputs(snapshot); if (!inputs.goal || !inputs.availability) throw new Error('Goal or availability information is missing. Complete your profile before reassessment.');
  const availability: PlanningAvailability = { weekdayMinuteLimits: JSON.parse(inputs.availability.weekdayLimitsJson) as Record<number, number>, preferredLongRunDay: inputs.availability.preferredLongRunDay, unavailableDates: JSON.parse(inputs.availability.exceptionsJson) as `${number}-${number}-${number}`[] };
  const goal: PlanningGoal = { mode: inputs.goal.mode, startDate: inputs.goal.startDate, raceDate: inputs.goal.raceDate, distanceMeters: inputs.goal.distanceMeters };
  const result = proposeAdjustment({ snapshot, logs: inputs.logs, resolutions: inputs.resolutions, availability, goal, policy: content.policy, today: localDateOnly() as `${number}-${number}-${number}` }); const proposalId = `review:${snapshot.plan.id}:${result.inputFingerprint}`;
  if (persist) { const proposal: AdjustmentProposal = { id: proposalId, planId: snapshot.plan.id, baseRevisionId: snapshot.revision.id, inputFingerprint: result.inputFingerprint, reasonsJson: JSON.stringify(result.reasonCodes), diffJson: JSON.stringify({ result, evidence: { activityIds: inputs.logs.map((log) => log.id), resolutionEventIds: inputs.resolutions.map((resolution) => resolution.eventId), templateId: snapshot.plan.templateId, templateVersion: snapshot.revision.templateVersion, policyId: content.policy.id, policyVersion: snapshot.revision.ruleVersion } }), constraintsJson: JSON.stringify(result.kind === 'unsupported' ? [] : result.constraints), targetDateEffect: result.targetDateEffect, status: 'pending', createdAt: new Date().toISOString() }; await repository.saveProposal(proposal); await repository.saveReviewState({ planId: snapshot.plan.id, proposalId, resultJson: JSON.stringify(result), inputFingerprint: result.inputFingerprint, reminderError: null, updatedAt: new Date().toISOString() }); }
  return { snapshot, result, proposalId, units: execution.units };
}

export async function loadPlanReviewOnDevice(): Promise<PlanReviewView> { const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return review(new TrainingRepository(database, ownerId), true); }

export async function confirmPlanReviewOnDevice(expectedFingerprint: string): Promise<{ changed: boolean; reminderWarning: string | null }> {
  const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); const repository = new TrainingRepository(database, ownerId); const current = await review(repository, false); if (current.result.inputFingerprint !== expectedFingerprint) throw new Error('New activity changed this review. Refresh before confirming.');
  if (current.result.kind === 'unsupported') throw new Error('This plan cannot resume automatically. Review the stated issue first.');
  if (current.result.kind === 'no_change') await repository.markPlanValidated({ planId: current.snapshot.plan.id, expectedRevisionId: current.snapshot.revision.id, expectedFingerprint: current.snapshot.plan.validationFingerprint, validatedFingerprint: current.result.inputFingerprint, proposalId: current.proposalId, event: { id: `review-confirmed:${current.result.inputFingerprint}`, actionType: 'plan_revalidated', relatedIdsJson: JSON.stringify([current.snapshot.plan.id, current.snapshot.revision.id]), occurredAt: new Date().toISOString() } });
  else await applyAdjustment(repository, current.snapshot, current.result, current.result.inputFingerprint, new Date().toISOString(), current.proposalId);
  try { await refreshActivePlanReminders(repository); return { changed: current.result.kind === 'proposal', reminderWarning: null }; } catch { return { changed: current.result.kind === 'proposal', reminderWarning: 'The plan was saved, but reminders could not be refreshed. You can retry from this screen.' }; }
}
