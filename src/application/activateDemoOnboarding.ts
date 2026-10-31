import { openAppDatabase } from '@/data/expoSqliteDatabase';
import * as Crypto from 'expo-crypto';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { demo10kTemplate, demo5kTemplate, demoHalfRules, demoHalfTemplate } from '@/domain/training/demoContent';
import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';
import { generatePlan, selectTemplate } from '@/domain/training/engine';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { Availability, LogicalSession, Plan, PlanRevision, RaceGoal, RunnerProfile, SessionAssignment } from '@/domain/training/entities';
import { requireActiveAccountId } from './localAccount';

const now = () => new Date().toISOString();

/** Creates only the explicitly labelled synthetic demo plan. Production activation still requires reviewed content. */
export async function activateDemoOnboarding(draft: OnboardingDraft): Promise<void> {
  const ownerId = await requireActiveAccountId(); const database = await openAppDatabase(); const timestamp = now(); await migrate(database, timestamp); const repository = new TrainingRepository(database, ownerId); const generationId = Crypto.randomUUID();
  const distanceMeters = Number(draft.goalDistance); const request = { profile: { entryRequirementsMet: true, recentWeeklyMinutes: Number(draft.weeklyRunningMinutes) || null, recentWeeklyVolumeUnit: 'minutes' as const, baselineLookbackDays: Number(draft.baselineLookbackDays) || null, recentLongestSessionMinutes: Number(draft.longestSessionMinutes) || null, recentLongestSessionDate: draft.longestSessionDate as `${number}-${number}-${number}`, comfortableDurationMinutes: Number(draft.comfortableDurationMinutes) || null, interruptionStatus: draft.recentInterruption }, goal: { mode: draft.goalMode, startDate: draft.startDate as `${number}-${number}-${number}`, raceDate: draft.goalMode === 'fixed_date' ? draft.raceDate as `${number}-${number}-${number}` : null, distanceMeters }, availability: { weekdayMinuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, Number(draft.minuteLimits[day])])), preferredLongRunDay: draft.preferredLongRunDay, unavailableDates: draft.unavailableDates.split(',').map((date) => date.trim()).filter(Boolean) as `${number}-${number}-${number}`[] }, templateMode: 'demo' as const };
  const templates = flexibleDemoTemplates;
  const selected = selectTemplate(request, templates, [demoHalfRules]);
  if (!selected) {
    const candidate = templates.find((template) => template.supportedGoal === (distanceMeters === 5000 ? demo5kTemplate.supportedGoal : distanceMeters === 10000 ? demo10kTemplate.supportedGoal : demoHalfTemplate.supportedGoal))!;
    const assessment = generatePlan(request, candidate, demoHalfRules);
    const reasons = assessment.kind === 'infeasible' ? assessment.reasonCodes : [];
    if (reasons.includes('fixed_date_incompatible')) throw new Error('The demo schedule does not fit this race date. Choose a flexible goal or a compatible date.');
    if (reasons.includes('day_time_limit_exceeded')) throw new Error('A demo workout does not fit the time available on its day. Review your daily time limits.');
    if (reasons.includes('unavailable_date_conflict')) throw new Error('A demo workout falls on an unavailable date. Review those dates or choose a different start date.');
    if (reasons.includes('availability_pattern_incompatible') || reasons.includes('spacing_violation')) throw new Error('The demo needs three available days with a rest day between runs. Try different days or a different long-run day.');
    throw new Error('No demo structure fits the supplied details. Review your baseline and availability; a foundation plan is not available yet.');
  }
  const { template } = selected;
  const generated = generatePlan(request, template, demoHalfRules); if (generated.kind !== 'preview') throw new Error(`The demo plan cannot be created: ${generated.reasonCodes.join(', ')}.`);
  const profile: RunnerProfile = { id: `profile:${generationId}`, units: draft.units, trainingTimezone: draft.timezone, baselineJson: JSON.stringify({ availabilityAssumedForDemo: true, baselineLevel: template.frequencyVariantId ?? 'demo', weeklyRunningMinutes: draft.weeklyRunningMinutes, baselineLookbackDays: draft.baselineLookbackDays, longestSessionMinutes: draft.longestSessionMinutes, longestSessionDate: draft.longestSessionDate, comfortableDurationMinutes: draft.comfortableDurationMinutes, recentInterruption: draft.recentInterruption }), recentWeeklyVolumeValue: Number(draft.weeklyRunningMinutes), recentWeeklyVolumeUnit: 'minutes', baselineLookbackDays: Number(draft.baselineLookbackDays), recentLongestSessionSeconds: Number(draft.longestSessionMinutes) * 60, recentLongestSessionDate: draft.longestSessionDate as `${number}-${number}-${number}`, comfortableDurationSeconds: Number(draft.comfortableDurationMinutes) * 60, interruptionStatus: draft.recentInterruption, version: 2, createdAt: timestamp, updatedAt: timestamp };
  const goal: RaceGoal = { id: `goal:${generationId}`, profileId: profile.id, mode: draft.goalMode, distanceMeters, raceDate: request.goal.raceDate, startDate: request.goal.startDate, version: 1, createdAt: timestamp };
  const availability: Availability = { id: `availability:${generationId}`, profileId: profile.id, weekdayLimitsJson: JSON.stringify(request.availability.weekdayMinuteLimits), preferredLongRunDay: draft.preferredLongRunDay, exceptionsJson: JSON.stringify(request.availability.unavailableDates), version: 1, createdAt: timestamp };
  const plan: Plan = { id: `plan:${generationId}`, goalId: goal.id, templateId: template.id, mode: 'demo', activeRevisionId: null, recommendationState: 'active', validationFingerprint: generated.preview.inputFingerprint, createdAt: timestamp };
  const revision: PlanRevision = { id: `revision:${generationId}`, planId: plan.id, parentRevisionId: null, engineVersion: '1', templateVersion: template.semanticVersion, ruleVersion: demoHalfRules.semanticVersion, inputFingerprint: generated.preview.inputFingerprint, explanationJson: JSON.stringify({ demoOnly: true, warnings: generated.preview.warnings, selection: generated.preview.selectionExplanation, baseline: request.profile, provenance: generated.preview.provenance }), createdAt: timestamp };
  const logical: LogicalSession[] = generated.preview.sessions.map((session) => ({ id: `logical:${generationId}:${session.logicalKey}`, planId: plan.id, stableKey: session.logicalKey, createdAt: timestamp }));
  const assignments: SessionAssignment[] = generated.preview.sessions.map((session) => ({ id: `assignment:${generationId}:${session.logicalKey}`, logicalSessionId: `logical:${generationId}:${session.logicalKey}`, revisionId: revision.id, plannedDate: session.plannedDate, phase: session.phase, role: session.role, prescriptionJson: JSON.stringify({ week: session.week, target: { durationSeconds: session.durationSeconds }, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives }) }));
  await repository.activateInitialPlan({ profile, goal, availability, snapshot: { plan, revision, assignments }, logicalSessions: logical, event: { id: `activation:${generationId}`, actionType: 'demo_plan_activated', relatedIdsJson: JSON.stringify([plan.id, revision.id, ownerId]), occurredAt: timestamp } });
}
