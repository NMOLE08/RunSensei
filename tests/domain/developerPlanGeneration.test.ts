import { compareDeveloperPlanAttempts, developerPlanExportFilename, generateDeveloperPlanAttempt, serializeDeveloperPlanAttempt, type DeveloperPlanRawInput } from '@/domain/research/developerPlanGeneration';

const input = (overrides: Partial<DeveloperPlanRawInput> = {}): DeveloperPlanRawInput => ({
  requestedGoal: 'first_5k_completion', goalFocus: 'completion', targetDistance: '5k', adultAgeConfirmed: true, canWalk30MinutesComfortably: true, experience: 'none_or_limited', healthConcern: false, interruption: 'none', continuousRunMinutes: '', weeklyRunningMinutes: '', longestRecentSessionMinutes: '', historyAgeDays: '', longestSessionAgeDays: '', planStartDate: '2026-11-02', goalMode: 'flexible', goalDate: '', availableDays: [1, 3, 6], weekdayMinuteLimits: { 1: '120', 3: '120', 6: '120' }, preferredDays: [], preferredLongRunDay: null, targetPerformance: '', performanceDate: '', trainingPreference: 'comfortable', ...overrides,
});
const metadata = { testId: 'test-A', generatedAt: '2026-11-04T10:00:00.000Z' };

describe('developer plan generation research lab', () => {
  it('generates an exact research-only run/walk draft from compatible evidence while the strict gate remains blocked', () => {
    const result = generateDeveloperPlanAttempt(input(), metadata);
    expect(result).toMatchObject({ researchOnly: true, productionEligible: false, strictGate: { productionEligible: false }, candidateCompatibility: { outcome: 'candidate_compatible_draft_only' }, selection: { kind: 'selected_for_research' }, systemC: { valid: true } });
    expect(result.plan?.sessions).toHaveLength(36);
    expect(result.plan?.weekly).toHaveLength(12);
    expect(result.plan?.weekly[11]).toMatchObject({ final5kEvent: true, totalWorkoutSeconds: null, runningSeconds: null });
  });

  it('uses the continuous candidate pathway only with the exact authored evidence', () => {
    const result = generateDeveloperPlanAttempt(input({ experience: 'substantial', continuousRunMinutes: '20', weeklyRunningMinutes: '50', longestRecentSessionMinutes: '20', historyAgeDays: '7', longestSessionAgeDays: '7' }), metadata);
    expect(result.selection.pathway).toMatchObject({ id: 'continuous_running_beginner_fixed_12_week' });
    expect(result.candidateCompatibility).toMatchObject({ outcome: 'candidate_compatible_draft_only' });
    expect(result.plan?.sessions[0]?.steps.some((step) => step.kind === 'walk')).toBe(false);
  });

  it('rejects ambiguous pathway evidence instead of silently choosing a programme', () => {
    const result = generateDeveloperPlanAttempt(input({ experience: 'unknown' }), metadata);
    expect(result.selection).toMatchObject({ kind: 'rejected', pathway: null, reasonCodes: ['experience_has_no_explicit_draft_pathway'] });
    expect(result.plan).toBeNull();
  });

  it('exports parseable JSON for blocked attempts without credentials or user records', () => {
    const result = generateDeveloperPlanAttempt(input({ healthConcern: true }), metadata);
    const json = serializeDeveloperPlanAttempt(result);
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: 'runsensei-developer-plan-attempt-v1', researchOnly: true, productionEligible: false, failureReasons: ['health_concern_reported'] });
    expect(json).not.toContain('access_token');
    expect(json).not.toContain('accountId');
    expect(developerPlanExportFilename('B', 'a test/id')).toBe('runsensei-research-plan-B-a-test-id.json');
  });

  it('keeps earlier attempt snapshots isolated from later input edits', () => {
    const raw = input();
    const first = generateDeveloperPlanAttempt(raw, metadata);
    raw.availableDays.push(0);
    raw.weekdayMinuteLimits[1] = '1';
    expect(first.rawInput.availableDays).toEqual([1, 3, 6]);
    expect(first.rawInput.weekdayMinuteLimits[1]).toBe('120');
  });

  it('does not claim workout personalization when only scheduling dates change', () => {
    const monday = generateDeveloperPlanAttempt(input({ planStartDate: '2026-11-02' }), metadata);
    const nextMonday = generateDeveloperPlanAttempt(input({ planStartDate: '2026-11-09' }), { ...metadata, testId: 'test-B' });
    expect(monday.plan?.sessions.map((session) => ({ week: session.week, code: session.code, steps: session.steps, durationSeconds: session.durationSeconds }))).toEqual(nextMonday.plan?.sessions.map((session) => ({ week: session.week, code: session.code, steps: session.steps, durationSeconds: session.durationSeconds })));
    expect(monday.plan?.sessions[0]?.date).not.toBe(nextMonday.plan?.sessions[0]?.date);
    const comparison = compareDeveloperPlanAttempts([{ slot: 'A', attempt: monday }, { slot: 'B', attempt: nextMonday }]);
    expect(comparison[1]).toMatchObject({ sameWorkoutPrescriptionAsFirstGeneratedPlan: true });
  });
});
