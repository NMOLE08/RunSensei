import type { DateOnly } from '@/domain/calendar/dateOnly';

export type Id = string;
export type UtcInstant = string;
export type UnitSystem = 'metric' | 'imperial';
export type PlanMode = 'demo' | 'real';
export type RecommendationState = 'active' | 'needs_review' | 'health_hold';
export type ResolutionKind = 'completed' | 'partial' | 'skipped' | 'different_activity';

export interface RunnerProfile { id: Id; units: UnitSystem; trainingTimezone: string; baselineJson: string; recentWeeklyVolumeValue?: number | null; recentWeeklyVolumeUnit?: 'minutes' | null; baselineLookbackDays?: number | null; recentLongestSessionSeconds?: number | null; recentLongestSessionDate?: DateOnly | null; comfortableDurationSeconds?: number | null; interruptionStatus?: 'none' | 'sustained' | 'unknown' | null; version: number; createdAt: UtcInstant; updatedAt: UtcInstant; }
export interface RaceGoal { id: Id; profileId: Id; mode: 'fixed_date' | 'flexible'; distanceMeters: number; raceDate: DateOnly | null; startDate: DateOnly; version: number; createdAt: UtcInstant; }
export interface Availability { id: Id; profileId: Id; weekdayLimitsJson: string; preferredLongRunDay: number | null; exceptionsJson: string; version: number; createdAt: UtcInstant; }
export interface Plan { id: Id; goalId: Id; templateId: Id; mode: PlanMode; activeRevisionId: Id | null; recommendationState: RecommendationState; validationFingerprint: string; createdAt: UtcInstant; }
export interface PlanRevision { id: Id; planId: Id; parentRevisionId: Id | null; engineVersion: string; templateVersion: string; ruleVersion: string; inputFingerprint: string; explanationJson: string; createdAt: UtcInstant; }
export interface LogicalSession { id: Id; planId: Id; stableKey: string; createdAt: UtcInstant; }
export interface SessionAssignment { id: Id; logicalSessionId: Id; revisionId: Id; plannedDate: DateOnly; phase: string; role: string; prescriptionJson: string; }
export interface ActivityLog { id: Id; previousVersionId: Id | null; sessionId: Id | null; actualDate: DateOnly; durationSeconds: number | null; distanceMeters: number | null; intendedEffort: string | null; reportedEffort: string | null; source: string; reasonsJson: string; concernFlagsJson: string; createdAt: UtcInstant; }
export interface SessionResolution { id: Id; sessionId: Id; revisionId: Id; kind: ResolutionKind; reason: string | null; eventId: Id; createdAt: UtcInstant; }
export interface AdjustmentProposal { id: Id; planId: Id; baseRevisionId: Id; inputFingerprint: string; reasonsJson: string; diffJson: string; constraintsJson: string; targetDateEffect: string | null; status: 'pending' | 'accepted' | 'dismissed' | 'stale'; createdAt: UtcInstant; }
export interface AuditEvent { id: Id; actionType: string; relatedIdsJson: string; occurredAt: UtcInstant; }
export interface ReminderRecord { id: Id; sessionId: Id; revisionId: Id; localTime: string; timezone: string; nativeNotificationId: string | null; desiredState: 'scheduled' | 'cancelled'; currentState: 'scheduled' | 'cancelled' | 'unknown'; }

export interface PlanSnapshot { plan: Plan; revision: PlanRevision; assignments: SessionAssignment[]; }
