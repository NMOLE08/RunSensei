import type { ActivityLog, ResolutionKind } from '@/domain/training/entities';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { decodeWorkoutFeedback } from '@/domain/training/feedback';

export type CompletionStatus = 'unreported' | 'completed' | 'partial' | 'missed' | 'different_activity';
export type MeasurementReliability = 'high' | 'medium' | 'low' | 'unknown';
export type WorkoutStructure = 'run_walk' | 'continuous_run' | 'distance_event' | 'unknown';
export type ComponentKind = 'warmup' | 'run' | 'walk' | 'recovery' | 'cooldown' | 'event';
export type WorkoutStepSnapshot = { kind: ComponentKind; seconds: number | null; repeats: number };

export type PlannedWorkoutSnapshot = {
  assignmentId: string;
  logicalSessionId: string;
  planId: string;
  revisionId: string;
  plannedDate: string;
  policyReferences: readonly string[];
  pathwayReference: { id: string; version: string } | null;
  structure: WorkoutStructure;
  durationSeconds: number | null;
  distanceMeters: number | null;
  steps: readonly WorkoutStepSnapshot[];
};

export type WorkoutCompletionRecord = {
  activityLogId: string | null;
  previousVersionId: string | null;
  workoutId: string;
  planId: string | null;
  revisionId: string | null;
  policyReferences: readonly string[];
  pathwayReference: { id: string; version: string } | null;
  status: CompletionStatus;
  actualDate: string | null;
  completedAt: string | null;
  actualDurationSeconds: number | null;
  actualRunningSeconds: number | null;
  actualDistanceMeters: number | null;
  rpe: number | null;
  difficulty: 'comfortable' | 'too_easy' | 'challenging' | 'too_difficult' | null;
  fatigue: 'none' | 'unusual' | null;
  discomfort: 'none' | 'pain_or_injury_concern' | null;
  reason: string | null;
  note: string | null;
  source: 'manual' | 'gps' | 'timer_only' | 'unknown';
  durationReliability: MeasurementReliability;
  distanceReliability: MeasurementReliability;
  observedWindow: { start: string | null; end: string | null };
};

export type WorkoutComponentDurations = { totalSeconds: number | null; runningSeconds: number | null; walkingSeconds: number | null; recoverySeconds: number | null; warmupSeconds: number | null; cooldownSeconds: number | null; eventSeconds: number | null };

/** Derives only authored components; unknown steps remain unknown instead of zero. */
export function plannedComponents(snapshot: PlannedWorkoutSnapshot): WorkoutComponentDurations {
  const total = snapshot.steps.some((step) => step.seconds === null) ? null : snapshot.steps.reduce((sum, step) => sum + (step.seconds ?? 0) * step.repeats, 0);
  const byKind = (kind: ComponentKind) => snapshot.steps.filter((step) => step.kind === kind).some((step) => step.seconds === null) ? null : snapshot.steps.filter((step) => step.kind === kind).reduce((sum, step) => sum + (step.seconds ?? 0) * step.repeats, 0);
  return { totalSeconds: total, runningSeconds: byKind('run'), walkingSeconds: byKind('walk'), recoverySeconds: byKind('recovery'), warmupSeconds: byKind('warmup'), cooldownSeconds: byKind('cooldown'), eventSeconds: byKind('event') };
}

export function structureForDraftSession(session: First5kDraftSession): WorkoutStructure {
  if (session.distanceMeters !== null) return 'distance_event';
  return session.steps.some((step) => step.kind === 'walk') ? 'run_walk' : session.steps.some((step) => step.kind === 'run') ? 'continuous_run' : 'unknown';
}

/** Maps durable activity/outcome entities to facts without adding storage or inferred values. */
export function completionFromActivity(log: ActivityLog, kind: ResolutionKind, snapshot: PlannedWorkoutSnapshot | null): WorkoutCompletionRecord {
  const status: CompletionStatus = kind === 'completed' ? 'completed' : kind === 'partial' ? 'partial' : kind === 'skipped' ? 'missed' : 'different_activity';
  const feedback = decodeWorkoutFeedback(log.reportedEffort);
  return {
    activityLogId: log.id, previousVersionId: log.previousVersionId, workoutId: log.sessionId ?? snapshot?.logicalSessionId ?? log.id,
    planId: snapshot?.planId ?? null, revisionId: snapshot?.revisionId ?? null, policyReferences: snapshot?.policyReferences ?? [], pathwayReference: snapshot?.pathwayReference ?? null,
    status, actualDate: log.actualDate, completedAt: log.createdAt, actualDurationSeconds: log.durationSeconds, actualRunningSeconds: null, actualDistanceMeters: log.distanceMeters,
    rpe: feedback?.exertion ?? null, difficulty: feedback?.comparison === 'easier' ? 'too_easy' : feedback?.comparison === 'expected' ? 'comfortable' : feedback?.comparison === 'harder' ? 'too_difficult' : null, fatigue: null, discomfort: safeConcern(log.concernFlagsJson) ? 'pain_or_injury_concern' : null,
    reason: safeReasons(log.reasonsJson), note: null, source: log.source === 'gps' || log.source === 'timer_only' || log.source === 'manual' ? log.source : 'unknown',
    durationReliability: log.durationSeconds === null ? 'unknown' : log.source === 'gps' || log.source === 'timer_only' ? 'high' : 'medium',
    distanceReliability: log.distanceMeters === null ? 'unknown' : log.source === 'gps' ? 'medium' : 'low',
    observedWindow: { start: null, end: log.createdAt },
  };
}
function safeConcern(value: string) { try { return (JSON.parse(value) as unknown[]).length > 0; } catch { return true; } }
function safeReasons(value: string) { try { const items = JSON.parse(value) as string[]; return items.join('; ') || null; } catch { return null; } }
