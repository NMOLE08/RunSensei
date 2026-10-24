import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { ActivityLog, ResolutionKind } from '@/domain/training/entities';

export type OutcomeKind = 'as_planned' | 'partial' | 'different_workout' | 'did_not_run';
export interface RecordSessionOutcomeInput {
  planId: string;
  revisionId: string;
  logicalSessionId: string;
  actualDate: `${number}-${number}-${number}`;
  kind: OutcomeKind;
  durationSeconds: number | null;
  distanceMeters: number | null;
  intendedEffort: string | null;
  reportedEffort: string | null;
  source: 'manual';
  reasons: string[];
  reviewedConcernFlags: string[];
  previousLogId?: string | null;
  idempotencyKey: string;
}

export interface OutcomeContext { now(): string; id(prefix: string): string; }
export const deviceOutcomeContext: OutcomeContext = { now: () => new Date().toISOString(), id: (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };

const resolutionByOutcome: Record<OutcomeKind, ResolutionKind> = { as_planned: 'completed', partial: 'partial', different_workout: 'different_activity', did_not_run: 'skipped' };

export async function recordSessionOutcome(repository: TrainingRepository, input: RecordSessionOutcomeInput, context: OutcomeContext = deviceOutcomeContext): Promise<{ saved: boolean; logId: string }> {
  if (input.durationSeconds !== null && input.durationSeconds < 0) throw new Error('Duration cannot be negative');
  if (input.distanceMeters !== null && input.distanceMeters < 0) throw new Error('Distance cannot be negative');
  if (input.kind === 'partial' && input.durationSeconds === null) throw new Error('Partial work requires its actual duration');
  if (input.kind === 'did_not_run' && (input.durationSeconds !== null || input.distanceMeters !== null)) throw new Error('Did not run cannot include fabricated activity values');
  const timestamp = context.now(); const logId = context.id('activity'); const eventId = input.previousLogId ? `correction:${input.previousLogId}:${input.idempotencyKey}` : `outcome:${input.logicalSessionId}:${input.idempotencyKey}`;
  const log: ActivityLog = { id: logId, previousVersionId: input.previousLogId ?? null, sessionId: input.logicalSessionId, actualDate: input.actualDate, durationSeconds: input.durationSeconds, distanceMeters: input.distanceMeters, intendedEffort: input.intendedEffort, reportedEffort: input.reportedEffort, source: input.source, reasonsJson: JSON.stringify(input.reasons), concernFlagsJson: JSON.stringify(input.reviewedConcernFlags), createdAt: timestamp };
  const saved = await repository.recordOutcome({ planId: input.planId, eventId, log, resolution: { id: context.id('resolution'), sessionId: input.logicalSessionId, revisionId: input.revisionId, kind: resolutionByOutcome[input.kind], reason: input.reasons.join('; ') || null, eventId, createdAt: timestamp }, audit: { id: context.id('audit'), actionType: input.previousLogId ? 'activity_corrected' : 'activity_recorded', relatedIdsJson: JSON.stringify([logId, input.logicalSessionId]), occurredAt: timestamp }, recommendationState: input.reviewedConcernFlags.length > 0 ? 'health_hold' : 'needs_review' });
  return { saved, logId };
}

export async function recordSessionOutcomeOnDevice(input: RecordSessionOutcomeInput): Promise<{ saved: boolean; logId: string }> { const database = await openAppDatabase(); await migrate(database, new Date().toISOString()); return recordSessionOutcome(new TrainingRepository(database), input); }
