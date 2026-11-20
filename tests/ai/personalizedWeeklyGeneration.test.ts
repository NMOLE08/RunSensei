import { LocalWeeklyPlanGenerationService } from '@/ai/services/LocalWeeklyPlanGenerationService';
import { validatePersonalizedWeeklyPlan, type PersonalizedTrainingPolicy, type PersonalizedWeeklyInput, type PersonalizedWeeklyPlan } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { acceptPersonalizedWeek } from '@/application/acceptPersonalizedWeek';
import { migrate } from '@/data/migrations';
import { TrainingRepository } from '@/data/repositories';
import type { Availability, RaceGoal, RunnerProfile } from '@/domain/training/entities';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';
import { addCalendarDays } from '@/domain/calendar/operations';

const duration = (min: number, max = min, step = 1) => ({ min, max, step });
const policy: PersonalizedTrainingPolicy = {
  id: 'reviewed-test-policy', version: 'test-v1', reviewed: true, reviewer: 'Test reviewer', reviewDate: '2026-10-01', maxRunDays: 3, maxRunMinutes: 120, minimumRecoveryDays: 1, maxLongRuns: 1, paceTargetsAllowed: false,
  workoutRules: [
    { id: 'walk-run-reviewed-test', type: 'walk_run', purpose: 'Test fixture only', allowedEfforts: ['easy'], durationMinutes: duration(25, 40, 5), distanceMeters: null, distanceSessionMinutes: null, requiredStepKinds: ['warmup', 'main', 'walk', 'cooldown'], stepRules: [
      { kind: 'warmup', targetKind: 'duration_minutes', range: duration(5), minRepeats: 1, maxRepeats: 1 }, { kind: 'main', targetKind: 'duration_minutes', range: duration(1, 3), minRepeats: 4, maxRepeats: 8 }, { kind: 'walk', targetKind: 'duration_minutes', range: duration(1, 2), minRepeats: 4, maxRepeats: 8 }, { kind: 'cooldown', targetKind: 'duration_minutes', range: duration(5), minRepeats: 1, maxRepeats: 1 },
    ] },
    { id: 'easy-reviewed-test', type: 'easy_run', purpose: 'Test fixture only', allowedEfforts: ['conversational'], durationMinutes: duration(30, 50, 5), distanceMeters: null, distanceSessionMinutes: null, requiredStepKinds: ['warmup', 'main', 'cooldown'], stepRules: [
      { kind: 'warmup', targetKind: 'duration_minutes', range: duration(5, 10, 5), minRepeats: 1, maxRepeats: 1 }, { kind: 'main', targetKind: 'duration_minutes', range: duration(20, 35, 5), minRepeats: 1, maxRepeats: 1 }, { kind: 'cooldown', targetKind: 'duration_minutes', range: duration(5, 10, 5), minRepeats: 1, maxRepeats: 1 },
    ] },
    { id: 'long-reviewed-test', type: 'long_run', purpose: 'Test fixture only', allowedEfforts: ['comfortable'], durationMinutes: duration(40, 60, 5), distanceMeters: null, distanceSessionMinutes: null, requiredStepKinds: ['warmup', 'main', 'cooldown'], stepRules: [
      { kind: 'warmup', targetKind: 'duration_minutes', range: duration(5, 10, 5), minRepeats: 1, maxRepeats: 1 }, { kind: 'main', targetKind: 'duration_minutes', range: duration(30, 45, 5), minRepeats: 1, maxRepeats: 1 }, { kind: 'cooldown', targetKind: 'duration_minutes', range: duration(5, 10, 5), minRepeats: 1, maxRepeats: 1 },
    ] },
  ],
};
const input = (runnerKind = 'beginner'): PersonalizedWeeklyInput => ({ schemaVersion: 'personalized-weekly-input-v1', weekStartDate: '2026-11-02', timezone: 'Asia/Kolkata', runnerProfileFingerprint: `profile-${runnerKind}`, runner: { kind: runnerKind }, goal: { kind: 'distance_completion', distanceMeters: runnerKind === 'beginner' ? 5000 : 10000, targetTimeSeconds: null, raceDate: null }, trainingState: { phase: 'base_build', weekNumber: 1, recentLoad: {}, previousOutcomes: [] }, availability: { runWeekdays: [0, 2, 5], maxSessionMinutesByWeekday: { 0: 45, 2: 45, 5: 65 }, unavailableDates: [] }, paceEvidence: { reliable: false, source: 'none', referenceSecondsPerKm: null }, policy });
const rest = (date: string) => ({ date, type: 'rest' as const, policyRuleId: null, purpose: 'Recovery', totalDurationMinutes: 0, totalDistanceMeters: 0, effortCue: null, paceTargetSecondsPerKm: null, steps: [], coachingExplanation: 'Rest fixture.' });
const workout = (date: string, kind: 'walk_run' | 'easy_run' | 'long_run', total: number) => ({ date, type: kind, policyRuleId: kind === 'walk_run' ? 'walk-run-reviewed-test' : kind === 'easy_run' ? 'easy-reviewed-test' : 'long-reviewed-test', purpose: 'Test fixture only', totalDurationMinutes: total, totalDistanceMeters: 0, effortCue: kind === 'walk_run' ? 'easy' : kind === 'easy_run' ? 'conversational' : 'comfortable', paceTargetSecondsPerKm: null, steps: kind === 'walk_run' ? [
  { kind: 'warmup' as const, target: { kind: 'duration_minutes' as const, value: 5 }, repeatCount: 1, effortCue: 'easy', purpose: 'Fixture' }, { kind: 'main' as const, target: { kind: 'duration_minutes' as const, value: 2 }, repeatCount: 5, effortCue: 'easy', purpose: 'Fixture' }, { kind: 'walk' as const, target: { kind: 'duration_minutes' as const, value: 1 }, repeatCount: 5, effortCue: 'easy', purpose: 'Fixture' }, { kind: 'cooldown' as const, target: { kind: 'duration_minutes' as const, value: 5 }, repeatCount: 1, effortCue: 'easy', purpose: 'Fixture' },
] : [{ kind: 'warmup' as const, target: { kind: 'duration_minutes' as const, value: 5 }, repeatCount: 1, effortCue: 'easy', purpose: 'Fixture' }, { kind: 'main' as const, target: { kind: 'duration_minutes' as const, value: total - 10 }, repeatCount: 1, effortCue: 'easy', purpose: 'Fixture' }, { kind: 'cooldown' as const, target: { kind: 'duration_minutes' as const, value: 5 }, repeatCount: 1, effortCue: 'easy', purpose: 'Fixture' }], coachingExplanation: 'Synthetic orchestration fixture.' });
const plan = (runnerKind = 'beginner'): PersonalizedWeeklyPlan => ({ schemaVersion: 'personalized-weekly-plan-v1', weekNumber: 1, startDate: '2026-11-02', goalSummary: `Fixture ${runnerKind}`, assumptions: [], safetyNotes: [], days: [workout('2026-11-02', runnerKind === 'beginner' ? 'walk_run' : 'easy_run', runnerKind === 'beginner' ? 25 : 35), rest('2026-11-03'), workout('2026-11-04', 'easy_run', 30), rest('2026-11-05'), rest('2026-11-06'), workout('2026-11-07', 'long_run', runnerKind === 'beginner' ? 40 : 50), rest('2026-11-08')] });

describe('personalized Qwen weekly generation', () => {
  test('invokes the provider and preserves meaningful profile-dependent differences', async () => {
    const provider = { structured: jest.fn(async (request: { userPrompt: string }) => JSON.stringify(plan(request.userPrompt.includes('profile-beginner') ? 'beginner' : 'recreational'))) };
    const service = new LocalWeeklyPlanGenerationService(provider as never, () => '2026-10-31T12:00:00.000Z');
    const beginner = await service.generate(input('beginner')); const recreational = await service.generate(input('recreational'));
    expect(provider.structured).toHaveBeenCalledTimes(2); expect(beginner.metadata.generator).toBe('qwen3.5-2b'); expect(beginner.plan.days[0].type).toBe('walk_run'); expect(recreational.plan.days[0].type).toBe('easy_run'); expect(beginner.plan).not.toEqual(recreational.plan);
    expect((provider.structured.mock.calls[0][0] as { userPrompt: string }).userPrompt).toContain('profile-beginner');
  });
  test('rejects unsupported types, invalid totals, pace without evidence, load, and spacing', () => {
    const base = plan(); const unsupported = structuredClone(base) as PersonalizedWeeklyPlan; unsupported.days[0].type = 'tempo'; expect(() => validatePersonalizedWeeklyPlan(unsupported, input())).toThrow(/approved workout rule/i);
    const totals = structuredClone(base) as PersonalizedWeeklyPlan; totals.days[0].totalDurationMinutes = 30; expect(() => validatePersonalizedWeeklyPlan(totals, input())).toThrow(/reconcile/i);
    const pace = structuredClone(base) as PersonalizedWeeklyPlan; pace.days[0].paceTargetSecondsPerKm = 300; expect(() => validatePersonalizedWeeklyPlan(pace, input())).toThrow(/pace target/i);
    const adjacent = structuredClone(base) as PersonalizedWeeklyPlan; adjacent.days[1] = { ...adjacent.days[2], date: '2026-11-03' }; adjacent.days[2] = rest('2026-11-04'); const spacingInput = input(); spacingInput.availability = { ...spacingInput.availability, runWeekdays: [0, 1, 5], maxSessionMinutesByWeekday: { 0: 45, 1: 45, 5: 65 } }; expect(() => validatePersonalizedWeeklyPlan(adjacent, spacingInput)).toThrow(/spacing/i);
    const loadInput = input(); loadInput.policy = { ...loadInput.policy, maxRunMinutes: 90 }; expect(() => validatePersonalizedWeeklyPlan(base, loadInput)).toThrow(/weekly load/i);
  });
  test('rejects malformed output after one repair and never substitutes a demo', async () => { const provider = { structured: jest.fn(async () => '{bad') }; await expect(new LocalWeeklyPlanGenerationService(provider as never).generate(input())).rejects.toThrow(/No deterministic plan was substituted/); expect(provider.structured).toHaveBeenCalledTimes(2); });
  test('blocks unreviewed policy and nested Strava provenance before inference', async () => { const provider = { structured: jest.fn() }; const service = new LocalWeeklyPlanGenerationService(provider as never); const unreviewed = input(); unreviewed.policy = { ...unreviewed.policy, reviewed: false }; await expect(service.generate(unreviewed)).rejects.toThrow(/Reviewed training policy/); const restricted = input(); restricted.runner = { source: 'strava_api' }; await expect(service.generate(restricted)).rejects.toThrow(/Strava-origin/); expect(provider.structured).not.toHaveBeenCalled(); });
  test('invokes AI, validates, persists only after acceptance, and is idempotent', async () => {
    const provider = { structured: jest.fn(async () => JSON.stringify(plan())) }; const generatedInput = input();
    const preview = await new LocalWeeklyPlanGenerationService(provider as never, () => '2026-10-31T12:00:00.000Z').generate(generatedInput);
    const database = new MemoryDatabase(); await migrate(database, '2026-10-31T12:00:00.000Z'); const repository = new TrainingRepository(database, 'account-1');
    expect(database.table('plans')).toHaveLength(0);
    const profile: RunnerProfile = { id: 'profile-1', units: 'metric', trainingTimezone: 'Asia/Kolkata', baselineJson: '{}', version: 1, createdAt: '2026-10-31T12:00:00.000Z', updatedAt: '2026-10-31T12:00:00.000Z' };
    const goal: RaceGoal = { id: 'goal-1', profileId: profile.id, mode: 'flexible', distanceMeters: 5000, raceDate: null, startDate: '2026-11-02', version: 1, createdAt: '2026-10-31T12:00:00.000Z' };
    const availability: Availability = { id: 'availability-1', profileId: profile.id, weekdayLimitsJson: JSON.stringify(generatedInput.availability.maxSessionMinutesByWeekday), preferredLongRunDay: 5, exceptionsJson: '[]', version: 1, createdAt: '2026-10-31T12:00:00.000Z' };
    const activation = { profile, goal, availability, preview, generationInput: generatedInput }; const context = { now: () => '2026-10-31T12:01:00.000Z', id: (prefix: string) => prefix };
    await expect(acceptPersonalizedWeek(repository, activation, context)).resolves.toMatchObject({ applied: true });
    expect(provider.structured).toHaveBeenCalledTimes(1); expect(database.table('plans')).toHaveLength(1); expect(database.table('session_assignments')).toHaveLength(3);
    const explanation = JSON.parse(String(database.table('plan_revisions')[0].explanation_json)); expect(explanation).toMatchObject({ generator: 'qwen3.5-2b', futureWeeksGenerated: false, rawGeneratedPlan: { days: expect.any(Array) } });
    await expect(acceptPersonalizedWeek(repository, activation, context)).resolves.toMatchObject({ applied: false }); expect(database.table('plan_revisions')).toHaveLength(1);
  });
  test('generates Week 2 only with Week 1 outcomes in the prompt', async () => {
    const nextInput = input('recreational'); nextInput.weekStartDate = '2026-11-09'; nextInput.trainingState = { ...nextInput.trainingState, weekNumber: 2, previousOutcomes: [{ date: '2026-11-04', status: 'partial', actualMinutes: 20, reportedEffort: 'harder' }] };
    const nextPlan = plan('recreational'); nextPlan.weekNumber = 2; nextPlan.startDate = nextInput.weekStartDate; nextPlan.days = nextPlan.days.map((day, index) => ({ ...day, date: addCalendarDays(nextInput.weekStartDate as `${number}-${number}-${number}`, index) }));
    const provider = { structured: jest.fn(async (request: { userPrompt: string }) => { expect(request.userPrompt).toContain('"status":"partial"'); return JSON.stringify(nextPlan); }) };
    const preview = await new LocalWeeklyPlanGenerationService(provider as never).generate(nextInput);
    expect(preview.plan.weekNumber).toBe(2); expect(preview.plan.days[0].date).toBe('2026-11-09'); expect(preview.plan.days[6].date).toBe('2026-11-15'); expect(preview.plan.days).toHaveLength(7);
  });
});

export { input as personalizedTestInput, plan as personalizedTestPlan, policy as personalizedTestPolicy };
