import { fingerprint } from '@/domain/context';
import type { AdjustmentResult } from '@/domain/training/adjustment';
import type { AuditEvent, PlanSnapshot, SessionAssignment } from '@/domain/training/entities';
import { TrainingRepository } from '@/data/repositories';

export async function applyAdjustment(repository: TrainingRepository, base: PlanSnapshot, result: AdjustmentResult, currentInputFingerprint: string, now: string, proposalId?: string): Promise<{ applied: boolean; revisionId: string }> {
  if (result.kind !== 'proposal') throw new Error('Only a validated adjustment proposal can be applied.');
  if (base.plan.recommendationState === 'health_hold') throw new Error('A health hold cannot be cleared by applying a schedule change.');
  if (result.inputFingerprint !== currentInputFingerprint) throw new Error('Proposal is stale; refresh the adjustment preview.');
  const revisionId = `revision:${base.revision.id}:${result.inputFingerprint}`;
  const assignments = result.after.map((assignment) => cloneForRevision(assignment, revisionId));
  let provenance: unknown; let selection: unknown; try { const previous = JSON.parse(base.revision.explanationJson); provenance = previous.provenance; selection = previous.selection; } catch { provenance = undefined; }
  const snapshot: PlanSnapshot = { plan: { ...base.plan, activeRevisionId: revisionId, recommendationState: 'active', validationFingerprint: result.inputFingerprint }, revision: { id: revisionId, planId: base.plan.id, parentRevisionId: base.revision.id, engineVersion: base.revision.engineVersion, templateVersion: base.revision.templateVersion, ruleVersion: base.revision.ruleVersion, inputFingerprint: result.inputFingerprint, explanationJson: JSON.stringify({ reasons: result.reasonCodes, explanation: result.explanation, constraints: result.constraints, targetDateEffect: result.targetDateEffect, provenance, selection }), createdAt: now }, assignments };
  const event: AuditEvent = { id: `apply:${base.revision.id}:${result.inputFingerprint}`, actionType: 'adjustment_applied', relatedIdsJson: JSON.stringify([base.revision.id, revisionId]), occurredAt: now };
  const applied = await repository.applyValidatedRevision({ snapshot, expectedRevisionId: base.revision.id, expectedFingerprint: base.plan.validationFingerprint, event, proposalId });
  return { applied, revisionId };
}

export function keepCurrentPlan(base: PlanSnapshot, result: AdjustmentResult, currentInputFingerprint: string): void {
  if (result.kind === 'unsupported' || !result.keepCurrentAllowed || base.plan.recommendationState !== 'active' || result.inputFingerprint !== currentInputFingerprint) throw new Error('Keep current plan is unavailable until current constraints pass revalidation.');
}

/** Undo is never a rollback: callers must first produce a fresh, validated future-only proposal against current logs. */
export async function undoAsNewRevision(repository: TrainingRepository, current: PlanSnapshot, revalidatedUndo: AdjustmentResult, currentInputFingerprint: string, now: string): Promise<{ applied: boolean; revisionId: string }> {
  return applyAdjustment(repository, current, revalidatedUndo, currentInputFingerprint, now);
}

export function staleFingerprint(base: PlanSnapshot, input: unknown): string { return fingerprint({ revision: base.revision.id, input }); }
function cloneForRevision(assignment: SessionAssignment, revisionId: string): SessionAssignment { return { ...assignment, id: `${revisionId}:${assignment.logicalSessionId}`, revisionId }; }
