import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import { demo10kTemplate, demo5kTemplate, demoHalfRules, demoHalfTemplate } from '@/domain/training/demoContent';
import { generatePlan } from '@/domain/training/engine';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { Availability, LogicalSession, Plan, PlanRevision, RaceGoal, RunnerProfile, SessionAssignment } from '@/domain/training/entities';

const now = () => new Date().toISOString();

/** Creates only the explicitly labelled synthetic demo plan. Production activation still requires reviewed content. */
export async function activateDemoOnboarding(draft: OnboardingDraft): Promise<void> {
  const database = await openAppDatabase(); const timestamp = now(); await migrate(database, timestamp); const repository = new TrainingRepository(database);
  const distanceMeters = Number(draft.goalDistance); const template = distanceMeters === 5000 ? demo5kTemplate : distanceMeters === 10000 ? demo10kTemplate : demoHalfTemplate; const request = { profile: { entryRequirementsMet: draft.entryRequirementStatus === 'meets' }, goal: { mode: draft.goalMode, startDate: draft.startDate as `${number}-${number}-${number}`, raceDate: draft.goalMode === 'fixed_date' ? draft.raceDate as `${number}-${number}-${number}` : null, distanceMeters }, availability: { weekdayMinuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, Number(draft.minuteLimits[day])])), preferredLongRunDay: draft.preferredLongRunDay, unavailableDates: draft.unavailableDates.split(',').map((date) => date.trim()).filter(Boolean) as `${number}-${number}-${number}`[] }, templateMode: 'demo' as const };
  const generated = generatePlan(request, template, demoHalfRules); if (generated.kind !== 'preview') throw new Error(`The demo plan cannot be created: ${generated.reasonCodes.join(', ')}.`);
  const profile: RunnerProfile = { id: 'demo-profile', units: draft.units, trainingTimezone: draft.timezone, baselineJson: JSON.stringify({ weeklyRunningMinutes: draft.weeklyRunningMinutes, longestSessionMinutes: draft.longestSessionMinutes, longestSessionDate: draft.longestSessionDate, comfortableDurationMinutes: draft.comfortableDurationMinutes }), version: 1, createdAt: timestamp, updatedAt: timestamp };
  const goal: RaceGoal = { id: 'demo-goal', profileId: profile.id, mode: draft.goalMode, distanceMeters, raceDate: request.goal.raceDate, startDate: request.goal.startDate, version: 1, createdAt: timestamp };
  const availability: Availability = { id: 'demo-availability', profileId: profile.id, weekdayLimitsJson: JSON.stringify(request.availability.weekdayMinuteLimits), preferredLongRunDay: draft.preferredLongRunDay, exceptionsJson: JSON.stringify(request.availability.unavailableDates), version: 1, createdAt: timestamp };
  const plan: Plan = { id: 'demo-plan', goalId: goal.id, templateId: template.id, mode: 'demo', activeRevisionId: null, recommendationState: 'active', validationFingerprint: generated.preview.inputFingerprint, createdAt: timestamp };
  const revision: PlanRevision = { id: `demo-revision-${Date.now()}`, planId: plan.id, parentRevisionId: null, engineVersion: '1', templateVersion: template.semanticVersion, ruleVersion: demoHalfRules.semanticVersion, inputFingerprint: generated.preview.inputFingerprint, explanationJson: JSON.stringify({ demoOnly: true, warnings: generated.preview.warnings }), createdAt: timestamp };
  await repository.saveProfile(profile); await repository.saveGoal(goal); await repository.saveAvailability(availability); await repository.savePlan(plan);
  const logical: LogicalSession[] = generated.preview.sessions.map((session) => ({ id: `demo-logical-${session.logicalKey}`, planId: plan.id, stableKey: session.logicalKey, createdAt: timestamp })); for (const session of logical) await repository.saveLogicalSession(session);
  const assignments: SessionAssignment[] = generated.preview.sessions.map((session) => ({ id: `demo-assignment-${revision.id}-${session.logicalKey}`, logicalSessionId: `demo-logical-${session.logicalKey}`, revisionId: revision.id, plannedDate: session.plannedDate, phase: session.phase, role: session.role, prescriptionJson: JSON.stringify({ week: session.week, target: { durationSeconds: session.durationSeconds }, purpose: session.purpose, effortCue: session.effortCue, steps: session.steps, approvedAlternatives: session.approvedAlternatives }) }));
  await repository.applyRevision({ plan, revision, assignments }, { id: `demo-plan-activated-${revision.id}`, actionType: 'demo_plan_activated', relatedIdsJson: JSON.stringify([plan.id, revision.id]), occurredAt: timestamp });
}
