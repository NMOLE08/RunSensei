import { openAppDatabase } from '@/data/expoSqliteDatabase';
import * as Crypto from 'expo-crypto';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { demo10kTemplate, demo5kTemplate, demoHalfRules, demoHalfTemplate } from '@/domain/training/demoContent';
import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';
import { generateWeeklyDemoPlan } from '@/domain/training/engine';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { GenerationResult, PlanningRequest } from '@/domain/training/content';
import type { Availability, LogicalSession, Plan, PlanRevision, RaceGoal, RunnerProfile, SessionAssignment } from '@/domain/training/entities';
import { requireActiveAccountId } from './localAccount';

const now = () => new Date().toISOString();

function planningRequest(draft: OnboardingDraft): PlanningRequest {
  return { profile: { entryRequirementsMet: true, recentWeeklyMinutes: Number(draft.weeklyRunningMinutes) || null, recentWeeklyVolumeUnit: 'minutes', baselineLookbackDays: Number(draft.baselineLookbackDays) || null, recentLongestSessionMinutes: Number(draft.longestSessionMinutes) || null, recentLongestSessionDate: draft.longestSessionDate as `${number}-${number}-${number}`, comfortableDurationMinutes: Number(draft.comfortableDurationMinutes) || null, interruptionStatus: draft.recentInterruption }, goal: { mode: draft.goalMode, startDate: draft.startDate as `${number}-${number}-${number}`, raceDate: draft.goalMode === 'fixed_date' ? draft.raceDate as `${number}-${number}-${number}` : null, distanceMeters: Number(draft.goalDistance) }, availability: { weekdayMinuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, Number(draft.minuteLimits[day])])), preferredLongRunDay: draft.preferredLongRunDay, unavailableDates: draft.unavailableDates.split(',').map((date) => date.trim()).filter(Boolean) as `${number}-${number}-${number}`[] }, templateMode: 'demo' };
}

/** Pure preview used by onboarding and activation so the accepted week is the displayed week. */
export function previewDemoOnboardingWeek(draft: OnboardingDraft): GenerationResult {
  const request = planningRequest(draft);
  const supportedGoal = request.goal.distanceMeters === 5000 ? demo5kTemplate.supportedGoal : request.goal.distanceMeters === 10000 ? demo10kTemplate.supportedGoal : request.goal.distanceMeters === 21097 ? demoHalfTemplate.supportedGoal : null;
  if (!supportedGoal || draft.goalKind !== 'distance_completion') return { kind: 'infeasible', reasonCodes: ['no_compatible_template'] };
  const template = flexibleDemoTemplates.find((item) => item.supportedGoal === supportedGoal);
  if (!template) return { kind: 'infeasible', reasonCodes: ['no_compatible_template'] };
  return generateWeeklyDemoPlan(request, template, demoHalfRules);
}

/** Creates only the explicitly labelled synthetic demo plan. Production activation still requires reviewed content. */
export async function activateDemoOnboarding(draft: OnboardingDraft): Promise<void> {
  const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); const timestamp = now(); await migrate(database, timestamp); const repository = new TrainingRepository(database, ownerId); const generationId = Crypto.randomUUID();
  const request = planningRequest(draft); const distanceMeters = request.goal.distanceMeters;
  const supportedGoal = distanceMeters === 5000 ? demo5kTemplate.supportedGoal : distanceMeters === 10000 ? demo10kTemplate.supportedGoal : distanceMeters === 21097 ? demoHalfTemplate.supportedGoal : null;
  if (!supportedGoal || draft.goalKind !== 'distance_completion') throw new Error('This goal has no compatible demo structure. The app did not substitute another distance.');
  const template = flexibleDemoTemplates.find((item) => item.supportedGoal === supportedGoal);
  if (!template) throw new Error('The selected historical demo content is unavailable. Retry after restoring the matching app content.');
  const generated = previewDemoOnboardingWeek(draft);
  if (generated.kind !== 'preview') {
    const assessment = generated;
    const reasons = assessment.kind === 'infeasible' ? assessment.reasonCodes : [];
    if (reasons.includes('fixed_date_incompatible')) throw new Error('The demo schedule does not fit this race date. Choose a flexible goal or a compatible date.');
    if (reasons.includes('day_time_limit_exceeded')) throw new Error('A demo workout does not fit the time available on its day. Review your daily time limits.');
    if (reasons.includes('unavailable_date_conflict')) throw new Error('A demo workout falls on an unavailable date. Review those dates or choose a different start date.');
    if (reasons.includes('availability_pattern_incompatible') || reasons.includes('spacing_violation')) throw new Error('The demo needs three available days with a rest day between runs. Try different days or a different long-run day.');
    throw new Error('No seven-day demo structure fits the supplied details. Review your baseline and availability; a foundation plan is not available yet.');
  }
  const profile: RunnerProfile = { id: `profile:${generationId}`, units: draft.units, trainingTimezone: draft.timezone, baselineJson: JSON.stringify({ schemaVersion: draft.schemaVersion, availabilityAssumedForDemo: false, baselineLevel: template.frequencyVariantId ?? 'demo', goalKind: draft.goalKind, goalEvent: draft.goalEvent, currentPerformance: draft.currentPerformance, targetPerformanceSeconds: draft.targetPerformanceSeconds || null, baselineHistoryStatus: draft.baselineHistoryStatus, baselineWeeks: draft.baselineWeeks, weeklyRunningMinutes: draft.weeklyRunningMinutes, baselineLookbackDays: draft.baselineLookbackDays, longestSessionMinutes: draft.longestSessionMinutes, longestSessionDate: draft.longestSessionDate, comfortableDurationMinutes: draft.comfortableDurationMinutes, recentInterruption: draft.recentInterruption, preferences: { volume: draft.volumePreference, difficulty: draft.difficultyPreference, workouts: draft.workoutPreferences }, assumptionsConfirmed: draft.assumptionsConfirmed }), recentWeeklyVolumeValue: Number(draft.weeklyRunningMinutes), recentWeeklyVolumeUnit: 'minutes', baselineLookbackDays: Number(draft.baselineLookbackDays), recentLongestSessionSeconds: Number(draft.longestSessionMinutes) * 60, recentLongestSessionDate: draft.longestSessionDate as `${number}-${number}-${number}`, comfortableDurationSeconds: Number(draft.comfortableDurationMinutes) * 60, interruptionStatus: draft.recentInterruption, version: 3, createdAt: timestamp, updatedAt: timestamp };
  const goal: RaceGoal = { id: `goal:${generationId}`, profileId: profile.id, mode: draft.goalMode, distanceMeters, raceDate: request.goal.raceDate, startDate: request.goal.startDate, version: 1, createdAt: timestamp };
  const availability: Availability = { id: `availability:${generationId}`, profileId: profile.id, weekdayLimitsJson: JSON.stringify(request.availability.weekdayMinuteLimits), preferredLongRunDay: draft.preferredLongRunDay, exceptionsJson: JSON.stringify(request.availability.unavailableDates), version: 1, createdAt: timestamp };
  const plan: Plan = { id: `plan:${generationId}`, goalId: goal.id, templateId: template.id, mode: 'demo', activeRevisionId: null, recommendationState: 'active', validationFingerprint: generated.preview.inputFingerprint, createdAt: timestamp };
  const revision: PlanRevision = { id: `revision:${generationId}`, planId: plan.id, parentRevisionId: null, engineVersion: 'rolling-week-1', templateVersion: template.semanticVersion, ruleVersion: demoHalfRules.semanticVersion, inputFingerprint: generated.preview.inputFingerprint, explanationJson: JSON.stringify({ generator: 'deterministic_demo', demoOnly: true, rollingWindowDays: 7, futureWeeksGenerated: false, warnings: generated.preview.warnings, selection: generated.preview.selectionExplanation, baseline: request.profile, provenance: generated.preview.provenance }), createdAt: timestamp };
  const logical: LogicalSession[] = generated.preview.sessions.map((session) => ({ id: `logical:${generationId}:${session.logicalKey}`, planId: plan.id, stableKey: session.logicalKey, createdAt: timestamp }));
  const assignments: SessionAssignment[] = generated.preview.sessions.map((session) => ({ id: `assignment:${generationId}:${session.logicalKey}`, logicalSessionId: `logical:${generationId}:${session.logicalKey}`, revisionId: revision.id, plannedDate: session.plannedDate, phase: session.phase, role: session.role, prescriptionJson: JSON.stringify({ week: session.week, target: { durationSeconds: session.durationSeconds }, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives }) }));
  await repository.activateInitialPlan({ profile, goal, availability, snapshot: { plan, revision, assignments }, logicalSessions: logical, event: { id: `activation:${generationId}`, actionType: 'demo_plan_activated', relatedIdsJson: JSON.stringify([plan.id, revision.id, ownerId]), occurredAt: timestamp } });
}
