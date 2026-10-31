import {
  addCalendarDays,
  buildWeeklyPlannerInput,
  GEMINI_MODEL,
  validateWeeklyPlan,
  WEEKLY_PLAN_VERSION,
  type ReviewedWeeklyPolicy,
  type RunnerQuestionnaire,
  type WeeklyPlanProposal,
} from '../../supabase/functions/_shared/weeklyPlanner';

const profile: RunnerQuestionnaire = {
  source: 'user_direct', timezone: 'Asia/Kolkata', goal: { kind: '10k', targetTimeSeconds: null },
  experience: 'recreational', maxRunDays: 3, maxMinutesPerSession: 45,
  availableWeekdays: [1, 3, 6], currentPain: false, illnessNow: false,
  restrictionNeedsReview: false, consentVersion: '2026-10-v1',
};

const rest = { id: 'rest', type: 'rest' as const, durationMinutes: 0, intensity: 'none', segments: [] };
const easy = {
  id: 'fixture-easy-30', type: 'easy_run' as const, durationMinutes: 30, intensity: 'easy',
  segments: [
    { phase: 'warmup' as const, minutes: 5, description: 'Fixture warmup' },
    { phase: 'work' as const, minutes: 20, description: 'Fixture easy work' },
    { phase: 'cooldown' as const, minutes: 5, description: 'Fixture cooldown' },
  ],
};
const recovery = {
  id: 'fixture-recovery-35', type: 'recovery_run' as const, durationMinutes: 35, intensity: 'easy',
  segments: [{ phase: 'work' as const, minutes: 35, description: 'Fixture recovery work' }],
};
const long = {
  id: 'fixture-long-40', type: 'long_run' as const, durationMinutes: 40, intensity: 'easy',
  segments: [{ phase: 'work' as const, minutes: 40, description: 'Fixture long work' }],
};
const policy: ReviewedWeeklyPolicy = {
  id: 'fixture-policy', version: 'test-only-v1', status: 'reviewed', maxRunMinutes: 105,
  allowedTemplates: [rest, easy, recovery, long],
};
const input = buildWeeklyPlannerInput(profile, [{
  source: 'runsensei_native', date: '2026-10-27', distanceM: 4000, activeSeconds: 1650,
}], policy, '2026-11-02');

const plan: WeeklyPlanProposal = {
  schemaVersion: WEEKLY_PLAN_VERSION,
  startDate: '2026-11-02', goalSummary: 'Synthetic test week', assumptions: [], safetyNotes: [],
  days: Array.from({ length: 7 }, (_, index) => ({
    date: addCalendarDays('2026-11-02', index), type: rest.type, templateId: rest.id,
    durationMinutes: rest.durationMinutes, intensity: rest.intensity, segments: [], rationale: 'Fixture rest',
  })),
};
plan.days[0] = { date: '2026-11-02', type: easy.type, templateId: easy.id, durationMinutes: easy.durationMinutes, intensity: easy.intensity, segments: easy.segments, rationale: 'Fixture' };
plan.days[2] = { date: '2026-11-04', type: recovery.type, templateId: recovery.id, durationMinutes: recovery.durationMinutes, intensity: recovery.intensity, segments: recovery.segments, rationale: 'Fixture' };
plan.days[5] = { date: '2026-11-07', type: long.type, templateId: long.id, durationMinutes: long.durationMinutes, intensity: long.intensity, segments: long.segments, rationale: 'Fixture' };
const copy = () => structuredClone(plan);

describe('server-only weekly planner contract', () => {
  test('uses the requested stable model', () => expect(GEMINI_MODEL).toBe('gemini-3.8-flash'));
  test('accepts exactly seven valid fixture days', () => expect(validateWeeklyPlan(plan, input)).toEqual({ runDays: 3, runMinutes: 105 }));
  test('rejects six days', () => expect(() => validateWeeklyPlan({ ...plan, days: plan.days.slice(0, 6) }, input)).toThrow(/exactly seven/i));
  test('rejects eight days', () => expect(() => validateWeeklyPlan({ ...plan, days: [...plan.days, plan.days[0]] }, input)).toThrow(/exactly seven/i));
  test('rejects wrong start', () => expect(() => validateWeeklyPlan({ ...plan, startDate: '2026-11-03' }, input)).toThrow(/start date/i));
  test('rejects duplicate or nonconsecutive dates', () => { const changed = copy(); changed.days[2].date = changed.days[1].date; expect(() => validateWeeklyPlan(changed, input)).toThrow(/consecutive/i); });
  test('rejects unavailable run weekday', () => { const changed = copy(); changed.days[1] = { ...changed.days[0], date: '2026-11-03' }; expect(() => validateWeeklyPlan(changed, { ...input, policy: { ...input.policy, maxRunMinutes: 200 } })).toThrow(/unavailable/i); });
  test('rejects weekly cap', () => expect(() => validateWeeklyPlan(plan, { ...input, policy: { ...input.policy, maxRunMinutes: 100 } })).toThrow(/weekly/i));
  test('rejects session cap', () => expect(() => validateWeeklyPlan(plan, { ...input, availability: { ...input.availability, maxSessionMinutes: 30 } })).toThrow(/session time/i));
  test('rejects unknown template', () => { const changed = copy(); changed.days[0].templateId = 'invented'; expect(() => validateWeeklyPlan(changed, input)).toThrow(/allowlist/i); });
  test('rejects a changed template duration', () => { const changed = copy(); changed.days[0].durationMinutes = 31; expect(() => validateWeeklyPlan(changed, input)).toThrow(/changed/i); });
  test('rejects changed reviewed steps', () => { const changed = copy(); changed.days[0].segments[1].description = 'Model invention'; expect(() => validateWeeklyPlan(changed, input)).toThrow(/changed/i); });
  test('rejects rest containing exercise', () => { const changed = copy(); changed.days[1].durationMinutes = 1; expect(() => validateWeeklyPlan(changed, input)).toThrow(); });
  test('rejects restricted Strava provenance', () => expect(() => buildWeeklyPlannerInput(profile, [{ source: 'strava_api' as never, date: '2026-10-01', distanceM: 1, activeSeconds: 1 }], policy, '2026-11-02')).toThrow(/provenance/i));
  test('rejects Strava-derived provenance', () => expect(() => buildWeeklyPlannerInput(profile, [{ source: 'user_direct', derivedFrom: ['strava_api' as never], date: '2026-10-01', distanceM: 1, activeSeconds: 1 }], policy, '2026-11-02')).toThrow(/provenance/i));
  test('keeps route coordinates out of the model input', () => {
    const tainted = [{ source: 'runsensei_native' as const, date: '2026-10-27', distanceM: 1000, activeSeconds: 400, route: [{ latitude: 1, longitude: 2 }] }];
    expect(JSON.stringify(buildWeeklyPlannerInput(profile, tainted, policy, '2026-11-02'))).not.toContain('latitude');
  });
  test.each(['currentPain', 'illnessNow', 'restrictionNeedsReview'] as const)('blocks automatic planning for %s', (field) => {
    expect(() => buildWeeklyPlannerInput({ ...profile, [field]: true }, [], policy, '2026-11-02')).toThrow(/health review/i);
  });
  test('missing reviewed policy does not pass', () => expect(() => buildWeeklyPlannerInput(profile, [], { ...policy, status: 'demo' as never }, '2026-11-02')).toThrow(/reviewed/i));
  test('invalid calendar dates are rejected', () => expect(() => addCalendarDays('2026-02-30', 1)).toThrow(/real calendar/i));
  test('missing run history remains an empty list', () => expect(buildWeeklyPlannerInput(profile, [], policy, '2026-11-02').recentRuns).toEqual([]));
  test('does not add pace when no reviewed pace input exists', () => expect(JSON.stringify(input)).not.toContain('pace'));
});
