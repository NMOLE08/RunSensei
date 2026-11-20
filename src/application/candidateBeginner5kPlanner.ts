import { LocalWeeklyPlanGenerationService, type PersonalizedWeekPreview } from '@/ai/services/LocalWeeklyPlanGenerationService';
import { buildPersonalizedRunnerContext } from '@/ai/services/RunnerProfileBuilder';
import type { PersonalizedWeeklyInput } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { assessBeginner5kCandidate, createBeginner5kCandidatePolicy, type CandidateIssue } from '@/domain/training/beginner5kCandidate';
import type { OnboardingDraft } from '@/domain/onboarding/types';
import type { ActivityLog } from '@/domain/training/entities';
import type { TrackerHistoryItem } from './trackerHistory';

export type CandidateBeginner5kRequest = { draft: OnboardingDraft; weekStartDate: string; weekNumber: number; phase: string; priorOutcomes: ActivityLog[] };
export type CandidateBeginner5kResult = { kind: 'preview'; preview: PersonalizedWeekPreview; label: string } | { kind: 'unavailable'; issues: CandidateIssue[]; message: string };

const positive = (value: string): number | null => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };
const daysUntil = (from: string, to: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00Z`); const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / 86_400_000) : null;
};

function candidateFacts(request: CandidateBeginner5kRequest) {
  const draft = request.draft;
  return {
    goalDistanceMeters: Number(draft.goalDistance), comfortableDurationMinutes: positive(draft.comfortableDurationMinutes), recentWeeklyMinutes: positive(draft.weeklyRunningMinutes), longestRepeatableMinutes: positive(draft.longestSessionMinutes), interruption: draft.recentInterruption,
    concern: draft.concernFlag, availableWeekdays: draft.trainingDays, minuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, positive(draft.minuteLimits[day] ?? '') ?? 0])), weekNumber: request.weekNumber,
    daysUntilGoal: draft.goalMode === 'fixed_date' ? daysUntil(request.weekStartDate, draft.raceDate) : null, difficultyPreference: draft.difficultyPreference,
  } as const;
}

/**
 * Generates a visibly labelled, unreviewed candidate preview. It cannot call
 * `acceptPersonalizedWeek`, so it cannot create an active real plan.
 */
export async function generateCandidateBeginner5kPreview(request: CandidateBeginner5kRequest, dependencies: { generator?: LocalWeeklyPlanGenerationService; nativeRuns?: TrackerHistoryItem[]; now?: () => string } = {}): Promise<CandidateBeginner5kResult> {
  const assessment = assessBeginner5kCandidate(candidateFacts(request));
  if (assessment.kind === 'ineligible') return { kind: 'unavailable', issues: assessment.issues, message: 'This draft 5K policy cannot produce a preview for the supplied information. No schedule was invented.' };
  const now = dependencies.now?.() ?? new Date().toISOString();
  const nativeRuns = dependencies.nativeRuns ?? [];
  const context = buildPersonalizedRunnerContext(request.draft, nativeRuns, request.priorOutcomes, { nowIso: now, phase: request.phase, weekNumber: request.weekNumber });
  const policy = createBeginner5kCandidatePolicy(assessment.tier);
  const minuteLimits = Object.fromEntries(request.draft.trainingDays.map((day) => [day, Number(request.draft.minuteLimits[day])])) as Record<number, number>;
  const input: PersonalizedWeeklyInput = {
    schemaVersion: 'personalized-weekly-input-v1', generationMode: 'development_preview', weekStartDate: request.weekStartDate, timezone: request.draft.timezone, runnerProfileFingerprint: context.fingerprint,
    runner: { ...context.runner, candidateAssessment: assessment.reason }, goal: context.goal, trainingState: context.trainingState,
    availability: { runWeekdays: [...request.draft.trainingDays], maxSessionMinutesByWeekday: minuteLimits, unavailableDates: request.draft.unavailableDates.split(',').map((date) => date.trim()).filter(Boolean) }, paceEvidence: context.paceEvidence, policy,
  };
  const preview = await (dependencies.generator ?? new LocalWeeklyPlanGenerationService()).generate(input);
  return { kind: 'preview', preview, label: 'DEVELOPMENT PREVIEW — unreviewed candidate 5K policy. Not coaching advice and cannot be activated as a real plan.' };
}
