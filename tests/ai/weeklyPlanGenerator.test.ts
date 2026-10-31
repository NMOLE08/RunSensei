import { WeeklyPlanGenerator } from '@/ai/services/WeeklyPlanGenerator';
import type { LocalWeeklyPlan, LocalWeeklyPlannerInput } from '@/ai/schemas/weeklyPlanSchema';
import { addCalendarDays } from '@/domain/calendar/operations';

const rest = { id: 'reviewed-rest', type: 'rest' as const, durationMinutes: 0, intensity: 'none', segments: [] };
const input: LocalWeeklyPlannerInput = { schemaVersion: 'local-weekly-input-v1', weekStartDate: '2026-11-02', timezone: 'Asia/Kolkata', goal: { kind: '5k', targetTimeSeconds: null, raceDate: null }, availability: { runWeekdays: [], maxRunDays: 0, maxSessionMinutesByWeekday: {} }, baseline: {}, recentNativeRuns: [], policy: { id: 'reviewed-test', version: '1', reviewed: true, maxRunMinutes: 0, allowedTemplates: [rest] } };
const plan: LocalWeeklyPlan = { schemaVersion: 'local-weekly-plan-v1', startDate: input.weekStartDate, goalSummary: 'Fixture', assumptions: [], safetyNotes: [], days: Array.from({ length: 7 }, (_, index) => ({ date: addCalendarDays(input.weekStartDate as never, index), type: 'rest', templateId: rest.id, durationMinutes: 0, intensity: 'none', segments: [], rationale: 'Fixture rest' })) };

describe('WeeklyPlanGenerator', () => {
  test('accepts one exact validated week', async () => { const inference = { structured: jest.fn(async () => JSON.stringify(plan)) }; await expect(new WeeklyPlanGenerator(inference as never).generate(input)).resolves.toEqual(plan); expect(inference.structured).toHaveBeenCalledTimes(1); });
  test('performs only one bounded repair', async () => { const inference = { structured: jest.fn().mockResolvedValueOnce('{}').mockResolvedValueOnce(JSON.stringify(plan)) }; await expect(new WeeklyPlanGenerator(inference as never).generate(input)).resolves.toEqual(plan); expect(inference.structured).toHaveBeenCalledTimes(2); });
  test('does not generate without reviewed policy', async () => { const inference = { structured: jest.fn() }; await expect(new WeeklyPlanGenerator(inference as never).generate({ ...input, policy: { ...input.policy, reviewed: false } })).rejects.toThrow(/reviewed/i); expect(inference.structured).not.toHaveBeenCalled(); });
  test('rejects invented templates after bounded attempts', async () => { const bad = structuredClone(plan); bad.days[0].templateId = 'invented'; const inference = { structured: jest.fn(async () => JSON.stringify(bad)) }; await expect(new WeeklyPlanGenerator(inference as never).generate(input)).rejects.toThrow(/valid week/i); expect(inference.structured).toHaveBeenCalledTimes(2); });
});
