import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import { bundledDraft5kProgramRegistry } from '@/domain/planning/draft5kProgramRegistry';
import type { First5kDraftSession, First5kSimulation } from '@/domain/planning/first5kPolicyPack';
import type { WorkoutPolicyPackReference } from '@/domain/planning/beginner5kPersonalizationPolicy';
import type { Beginner5kAdaptationResult } from './evaluateBeginner5kAdaptation';
import { beginner5kAdaptationPrescriptionV02, type Beginner5kAdaptationPrescriptionPolicy } from './beginner5kAdaptationPrescriptionPolicy';

export type AdaptationPreviewAssignment = { draftAssignmentId: string; sourceWorkoutId: string; sourceWeek: number; displayWeek: number; copiedFromSource: boolean; session: First5kDraftSession };
export type AdaptationPreviewValidation = { structurallyValid: boolean; violations: readonly string[]; coachingReviewWarnings: readonly string[]; appliedPolicyReferences: readonly string[]; productionEligible: false };
export type AdaptationPreview = { kind: 'preview'; label: 'DRAFT ADAPTATION PREVIEW — NOT FOR PRODUCTION'; transformation: 'unchanged' | 'repeat_stage'; before: readonly AdaptationPreviewAssignment[]; after: readonly AdaptationPreviewAssignment[]; differences: readonly string[]; eventDateEffect: { previous: string; proposed: string } | null; validation: AdaptationPreviewValidation; productionEligible: false } | { kind: 'policy_gap' | 'hold_for_review' | 'insufficient_evidence' | 'scheduling_conflict'; reasonCodes: readonly string[]; productionEligible: false };
export type AdaptationPreviewInput = { decision: Beginner5kAdaptationResult; prescriptionPolicyReference: { policyId: string; version: string }; workoutPolicyPack: WorkoutPolicyPackReference; baseSimulation: First5kSimulation; currentWeek: number; goalMode: 'fixed_date' | 'flexible'; goalDate: string | null; completedSourceWorkoutIds: readonly string[]; weekdayMinuteLimits: Readonly<Record<number, number | null>>; unavailableDates: readonly string[] };

/** Offline-only preview. It never writes assignments and retains the immutable simulation as its before state. */
export function previewBeginner5kAdaptation(input: AdaptationPreviewInput): AdaptationPreview {
  const policy = beginner5kAdaptationPrescriptionV02;
  if (input.prescriptionPolicyReference.policyId !== policy.policyId || input.prescriptionPolicyReference.version !== policy.version) return blocked('policy_gap', ['adaptation_prescription_policy_version_unavailable']);
  if (input.decision.decision === 'hold_for_review') return blocked('hold_for_review', input.decision.reasonCodes);
  if (input.decision.decision === 'insufficient_evidence') return blocked('insufficient_evidence', input.decision.reasonCodes);
  if (input.decision.decision === 'policy_gap' || input.decision.decision === 'reduce_candidate') return blocked('policy_gap', input.decision.decision === 'reduce_candidate' ? ['lower_workload_variant_not_authored'] : input.decision.reasonCodes);
  const program = bundledDraft5kProgramRegistry.resolve(input.workoutPolicyPack);
  if (!program || input.baseSimulation.kind !== 'draft_simulation') return blocked('policy_gap', ['immutable_workout_policy_pack_unavailable']);
  const baseValidation = program.validate(input.baseSimulation, { unavailableDates: [...input.unavailableDates] });
  if (!baseValidation.valid) return blocked('scheduling_conflict', baseValidation.violations.map((item) => item.code));
  const before = assignments(input.baseSimulation.sessions, input.workoutPolicyPack, false);
  if (input.decision.decision === 'advance_candidate' || input.decision.decision === 'maintain_candidate') return preview('unchanged', before, before, [], null, validatePreview(before, before, input, policy));
  if (input.currentWeek < 1 || input.currentWeek >= 12) return blocked('policy_gap', ['repeat_event_or_unknown_stage_not_supported']);
  if (input.goalMode === 'fixed_date') return blocked('scheduling_conflict', ['fixed_goal_date_repeat_conflict']);
  const after = repeatStage(before, input.currentWeek, input.workoutPolicyPack);
  const originalEvent = before.find((item) => item.sourceWeek === 12 && item.session.code === 'C')?.session.date ?? null;
  const proposedEvent = after.find((item) => item.sourceWeek === 12 && item.session.code === 'C')?.session.date ?? null;
  const validation = validatePreview(before, after, input, policy);
  return preview('repeat_stage', before, after, [`Exact authored Week ${input.currentWeek} is inserted after Week ${input.currentWeek}; later future source stages shift by one calendar week.`, 'Modified progression is a draft coaching-review issue; this is not an approved adaptation.'], originalEvent && proposedEvent ? { previous: originalEvent, proposed: proposedEvent } : null, validation);
}

function assignments(sessions: readonly First5kDraftSession[], pack: WorkoutPolicyPackReference, copied: boolean): AdaptationPreviewAssignment[] { return sessions.map((session) => ({ draftAssignmentId: `${pack.policyId}@${pack.version}:source-w${session.week}${session.code}`, sourceWorkoutId: `${pack.policyId}@${pack.version}:w${session.week}${session.code}`, sourceWeek: session.week, displayWeek: session.week, copiedFromSource: copied, session })); }
function repeatStage(before: readonly AdaptationPreviewAssignment[], currentWeek: number, pack: WorkoutPolicyPackReference): AdaptationPreviewAssignment[] {
  const repeat = before.filter((item) => item.sourceWeek === currentWeek).map((item) => ({ ...item, draftAssignmentId: `${pack.policyId}@${pack.version}:repeat-after-w${currentWeek}:${item.sourceWorkoutId}`, displayWeek: currentWeek + 1, copiedFromSource: true, session: { ...item.session, date: addCalendarDays(item.session.date as `${number}-${number}-${number}`, 7) } }));
  const unchangedAndShifted = before.map((item) => item.sourceWeek <= currentWeek ? item : { ...item, displayWeek: item.displayWeek + 1, session: { ...item.session, date: addCalendarDays(item.session.date as `${number}-${number}-${number}`, 7) } });
  return [...unchangedAndShifted, ...repeat].sort((left, right) => left.session.date.localeCompare(right.session.date) || left.draftAssignmentId.localeCompare(right.draftAssignmentId));
}
function validatePreview(before: readonly AdaptationPreviewAssignment[], after: readonly AdaptationPreviewAssignment[], input: AdaptationPreviewInput, policy: Beginner5kAdaptationPrescriptionPolicy): AdaptationPreviewValidation {
  const violations: string[] = []; const warnings: string[] = [];
  if (after.length !== 36 && after.length !== 39) violations.push('unexpected_session_count');
  for (const completedSourceWorkoutId of input.completedSourceWorkoutIds) {
    const original = before.find((item) => item.sourceWorkoutId === completedSourceWorkoutId);
    const preserved = after.find((item) => item.sourceWorkoutId === completedSourceWorkoutId && !item.copiedFromSource);
    if (!original || !preserved || preserved.draftAssignmentId !== original.draftAssignmentId || preserved.session.date !== original.session.date) violations.push('historical_completed_assignment_not_preserved');
  }
  const event = after.filter((item) => item.session.distanceMeters === 5000 || item.session.steps.some((step) => step.kind === 'event'));
  if (event.length !== 1 || event[0]?.session.durationSeconds !== null || event[0]?.session.distanceMeters !== 5000) violations.push('final_5k_event_not_preserved');
  for (const assignment of after) {
    if (assignment.session.policyRefs.length !== input.workoutPolicyPack.policyReferences.length || assignment.session.policyRefs.some((ref, index) => ref !== input.workoutPolicyPack.policyReferences[index])) violations.push('historical_policy_references_not_preserved');
    if (input.unavailableDates.includes(assignment.session.date)) violations.push('unavailable_date_conflict');
    const limit = input.weekdayMinuteLimits[weekday(assignment.session.date as `${number}-${number}-${number}`)];
    if (limit === null || limit === undefined || (assignment.session.durationSeconds !== null && assignment.session.durationSeconds > limit * 60)) violations.push('weekday_time_limit_conflict');
    if (assignment.session.durationSeconds !== null && assignment.session.steps.reduce((sum, step) => sum + (step.seconds ?? 0) * step.repeats, 0) !== assignment.session.durationSeconds) violations.push('workout_arithmetic_mismatch');
  }
  const ordered = [...after].sort((left, right) => left.session.date.localeCompare(right.session.date));
  for (let index = 1; index < ordered.length; index += 1) { const previous = new Date(`${ordered[index - 1].session.date}T00:00:00Z`).getTime(); const current = new Date(`${ordered[index].session.date}T00:00:00Z`).getTime(); if ((current - previous) / 86400000 < 2) violations.push('recovery_spacing_violation'); }
  const byDisplayWeek = new Map<number, AdaptationPreviewAssignment[]>(); for (const assignment of after) { const items = byDisplayWeek.get(assignment.displayWeek) ?? []; items.push(assignment); byDisplayWeek.set(assignment.displayWeek, items); }
  if ([...byDisplayWeek.values()].some((items) => items.length !== 3)) violations.push('weekly_session_count_mismatch');
  if (after.length === 39) {
    warnings.push('modified_progression_requires_qualified_coach_review');
    warnings.push('accumulated_training_workload_changed_requires_review');
    if (after.some((item) => (item.sourceWeek === 4 || item.sourceWeek === 8) && item.displayWeek !== item.sourceWeek)) warnings.push('protected_recovery_week_displaced_requires_review');
    if (policy.safetyConstraints.modifiedProgressionRequiresCoachReview !== true) violations.push('modified_progression_policy_constraint_missing');
  }
  return { structurallyValid: violations.length === 0, violations: [...new Set(violations)].sort(), coachingReviewWarnings: [...new Set(warnings)].sort(), appliedPolicyReferences: [...input.workoutPolicyPack.policyReferences, `${policy.policyId}@${policy.version}`], productionEligible: false };
}
function preview(transformation: 'unchanged' | 'repeat_stage', before: readonly AdaptationPreviewAssignment[], after: readonly AdaptationPreviewAssignment[], differences: readonly string[], eventDateEffect: { previous: string; proposed: string } | null, validation: AdaptationPreviewValidation): AdaptationPreview { return { kind: 'preview', label: 'DRAFT ADAPTATION PREVIEW — NOT FOR PRODUCTION', transformation, before, after, differences, eventDateEffect, validation, productionEligible: false }; }
function blocked(kind: Exclude<AdaptationPreview['kind'], 'preview'>, reasonCodes: readonly string[]): AdaptationPreview { return { kind, reasonCodes, productionEligible: false }; }
