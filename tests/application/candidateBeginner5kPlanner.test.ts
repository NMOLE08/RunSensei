import { generateCandidateBeginner5kPreview } from '@/application/candidateBeginner5kPlanner';
import { emptyDraft } from '@/domain/onboarding/types';
import type { PersonalizedTrainingPolicy, PersonalizedWeeklyPlan } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { addCalendarDays } from '@/domain/calendar/operations';
import { LocalWeeklyPlanGenerationService } from '@/ai/services/LocalWeeklyPlanGenerationService';

function draft() { const value = emptyDraft('Asia/Kolkata'); value.goalEvent = '5k'; value.goalDistance = '5000'; value.goalMode = 'fixed_date'; value.raceDate = '2027-01-15'; value.weeklyRunningMinutes = '40'; value.longestSessionMinutes = '20'; value.comfortableDurationMinutes = '25'; value.recentInterruption = 'none'; value.trainingDays = [0, 2, 5]; value.minuteLimits = { 0: '45', 2: '45', 5: '50' }; return value; }
const rest = (date: string) => ({ date, type: 'rest' as const, policyRuleId: null, purpose: 'Rest', totalDurationMinutes: 0, totalDistanceMeters: 0, effortCue: null, paceTargetSecondsPerKm: null, steps: [], coachingExplanation: 'Draft rest day.' });
function planFor(policy: PersonalizedTrainingPolicy, startDate: string, weekNumber: number): PersonalizedWeeklyPlan {
  const standard = policy.workoutRules.find((item) => item.type !== 'long_run')!; const alternate = policy.workoutRules.filter((item) => item.type !== 'long_run')[1] ?? standard; const long = policy.workoutRules.find((item) => item.type === 'long_run')!;
  const day = (date: string, rule: typeof standard) => ({ date, type: rule.type, policyRuleId: rule.id, purpose: rule.purpose, totalDurationMinutes: rule.durationMinutes!.min, totalDistanceMeters: 0, effortCue: rule.allowedEfforts[0], paceTargetSecondsPerKm: null, steps: rule.stepRules.map((step) => ({ kind: step.kind, target: { kind: step.targetKind, value: step.range.min }, repeatCount: step.minRepeats, effortCue: rule.allowedEfforts[0], purpose: rule.purpose })), coachingExplanation: 'Synthetic candidate preview fixture.' });
  return { schemaVersion: 'personalized-weekly-plan-v1', weekNumber, startDate, goalSummary: 'Draft candidate 5K preview', assumptions: [], safetyNotes: ['Draft only.'], days: [day(startDate, standard), rest(addCalendarDays(startDate as `${number}-${number}-${number}`, 1)), day(addCalendarDays(startDate as `${number}-${number}-${number}`, 2), alternate), rest(addCalendarDays(startDate as `${number}-${number}-${number}`, 3)), rest(addCalendarDays(startDate as `${number}-${number}-${number}`, 4)), day(addCalendarDays(startDate as `${number}-${number}-${number}`, 5), long), rest(addCalendarDays(startDate as `${number}-${number}-${number}`, 6))] };
}

describe('candidate beginner-to-5K Qwen orchestration', () => {
  test('passes a bounded draft policy and runner assessment to the provider without permitting activation', async () => {
    const provider = { structured: jest.fn(async (request: { userPrompt: string }) => { const embedded = JSON.parse(request.userPrompt.split('Input:\n')[1]); return JSON.stringify(planFor(embedded.policy, embedded.weekStartDate, embedded.trainingState.weekNumber)); }) };
    // Build a real service around the mock provider to prove the prompt/validator path.
    const generated = await generateCandidateBeginner5kPreview({ draft: draft(), weekStartDate: '2026-11-02', weekNumber: 1, phase: 'foundation', priorOutcomes: [] }, { generator: new LocalWeeklyPlanGenerationService(provider as never), nativeRuns: [], now: () => '2026-10-31T00:00:00.000Z' });
    expect(generated).toMatchObject({ kind: 'preview', preview: { metadata: { generator: 'qwen3.5-2b', contentStatus: 'draft', generationMode: 'development_preview' } } });
    expect(provider.structured.mock.calls[0][0].userPrompt).toContain('intro-standard');
  });

  test('changes the bounded candidate policy for a more established runner without treating a target as fitness', async () => {
    const provider = { structured: jest.fn(async (request: { userPrompt: string }) => { const embedded = JSON.parse(request.userPrompt.split('Input:\n')[1]); return JSON.stringify(planFor(embedded.policy, embedded.weekStartDate, embedded.trainingState.weekNumber)); }) };
    const newer = draft(); const established = draft(); established.weeklyRunningMinutes = '90'; established.longestSessionMinutes = '25'; established.comfortableDurationMinutes = '35'; established.difficultyPreference = 'balanced';
    await generateCandidateBeginner5kPreview({ draft: newer, weekStartDate: '2026-11-02', weekNumber: 1, phase: 'foundation', priorOutcomes: [] }, { generator: new LocalWeeklyPlanGenerationService(provider as never), nativeRuns: [] });
    await generateCandidateBeginner5kPreview({ draft: established, weekStartDate: '2026-11-02', weekNumber: 8, phase: 'foundation', priorOutcomes: [] }, { generator: new LocalWeeklyPlanGenerationService(provider as never), nativeRuns: [] });
    expect(provider.structured.mock.calls[0][0].userPrompt).toContain('intro-standard');
    expect(provider.structured.mock.calls[1][0].userPrompt).toContain('continuous-easy');
  });

  test('returns a clear unavailable state instead of manufacturing a candidate plan', async () => {
    const incomplete = draft(); incomplete.comfortableDurationMinutes = '';
    await expect(generateCandidateBeginner5kPreview({ draft: incomplete, weekStartDate: '2026-11-02', weekNumber: 1, phase: 'foundation', priorOutcomes: [] }, { nativeRuns: [] })).resolves.toMatchObject({ kind: 'unavailable', issues: ['insufficient_baseline'] });
  });
});
