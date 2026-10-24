import type { AuditEvent, PlanSnapshot } from '@/domain/training/entities';
import { TrainingRepository } from '@/data/repositories';

/** Application boundary: domain generation happens elsewhere; persistence is atomic here. */
export async function activatePlanRevision(repository: TrainingRepository, snapshot: PlanSnapshot, auditEvent: AuditEvent): Promise<void> {
  await repository.applyRevision(snapshot, auditEvent);
}
