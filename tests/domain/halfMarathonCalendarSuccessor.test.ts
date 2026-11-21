import {
  createCurrentHalfMarathonDraftPolicy,
  createHalfMarathonDraftPolicy,
  simulateCurrentHalfMarathonDraft,
  simulateHalfMarathonDraft,
  validateCurrentHalfMarathonPolicy,
} from '@/domain/planning/halfMarathonDraft';
import { MultiDistancePolicyRegistry } from '@/domain/planning/multiDistancePolicyRegistry';
import legacyPolicyArtifact from '../../PolicyPack/half_marathon/07_parameterized_personalization_policy_v0.2.0_draft.json';
import currentPolicyArtifact from '../../PolicyPack/half_marathon/09_parameterized_personalization_policy_v0.3.0_calendar_draft.json';

const calendarDays3 = [
  { weekday: 1, maxMinutes: null, confirmedByRunner: false },
  { weekday: 3, maxMinutes: null, confirmedByRunner: false },
  { weekday: 6, maxMinutes: null, confirmedByRunner: false },
];
const calendarDays4 = [
  { weekday: 0, maxMinutes: null, confirmedByRunner: false },
  { weekday: 1, maxMinutes: null, confirmedByRunner: false },
  { weekday: 3, maxMinutes: null, confirmedByRunner: false },
  { weekday: 6, maxMinutes: null, confirmedByRunner: false },
];
const confirmedDays3 = calendarDays3.map((day) => ({ ...day, maxMinutes: 180, confirmedByRunner: true }));
const confirmedDays4 = calendarDays4.map((day) => ({ ...day, maxMinutes: 180, confirmedByRunner: true }));

function input(overrides = {}) {
  return {
    ownerId: 'calendar-runner',
    weeklyMinutes: 110,
    longestSessionMinutes: 45,
    comfortableRunMinutes: 40,
    weeklyEvidenceObservedAt: '2027-01-02' as const,
    longestSessionDate: '2027-01-02' as const,
    asOfDate: '2027-01-04' as const,
    interruption: 'none' as const,
    healthConcern: false,
    availableDays: calendarDays3,
    unavailableDates: [],
    preferredLongRunDay: 6,
    startDate: '2027-01-04' as const,
    fixedGoalDate: null,
    ...overrides,
  };
}

function prescription(result: ReturnType<typeof simulateHalfMarathonDraft>) {
  if (result.kind !== 'simulation') throw new Error(`Expected simulation, received ${result.kind}.`);
  return result.weeks.map((week) => ({
    week: week.week,
    weeklyMinutes: week.weeklyMinutes,
    targetWeeklyMinutes: week.targetWeeklyMinutes,
    longRunMinutes: week.longRunMinutes,
    targetLongRunMinutes: week.targetLongRunMinutes,
    recoveryWeek: week.recoveryWeek,
    taper: week.taper,
    workouts: week.workouts.map((workout) => ({
      week: workout.week,
      date: workout.date,
      slot: workout.slot,
      role: workout.role,
      phase: workout.phase,
      purpose: workout.purpose,
      target: workout.target,
      protected: workout.protected,
      steps: workout.steps,
    })),
  }));
}

describe('calendar-only half-marathon research successor', () => {
  it('copies every authored numerical and workout field from the immutable predecessor', () => {
    expect(currentPolicyArtifact.program).toEqual(legacyPolicyArtifact.program);
    expect(currentPolicyArtifact.frequency_variants).toEqual(legacyPolicyArtifact.frequency_variants);
    expect(currentPolicyArtifact.workout_structure).toEqual(legacyPolicyArtifact.workout_structure);
    expect(currentPolicyArtifact.scheduling).toEqual(legacyPolicyArtifact.scheduling);
  });

  it('generates the complete three-session calendar candidate without inventing time limits', () => {
    const result = simulateCurrentHalfMarathonDraft(input());
    expect(result).toMatchObject({ kind: 'simulation', researchOnly: true, productionEligible: false, policy: { version: '0.3.0-calendar-draft', reviewStatus: 'draft' }, band: 'foundation_3_day' });
    if (result.kind === 'simulation') {
      expect(result.weeks).toHaveLength(10);
      expect(result.weeks.flatMap((week) => week.workouts)).toHaveLength(30);
      expect(result.weeks.every((week) => week.warnings.includes('personal_time_availability_not_assessed'))).toBe(true);
      expect(result.weeks[0]?.workouts.map((workout) => workout.date)).toEqual(['2027-01-05', '2027-01-07', '2027-01-10']);
      expect(result.weeks[9]?.workouts.find((workout) => workout.role === 'event')?.target).toEqual({ kind: 'distance_meters', value: 21097.5 });
      expect(result.validation).toEqual({ valid: true, issues: [] });
    }
  });

  it('generates the complete four-session calendar candidate', () => {
    const result = simulateCurrentHalfMarathonDraft(input({ weeklyMinutes: 180, longestSessionMinutes: 70, availableDays: calendarDays4 }));
    expect(result).toMatchObject({ kind: 'simulation', band: 'established_4_day' });
    if (result.kind === 'simulation') {
      expect(result.weeks.flatMap((week) => week.workouts)).toHaveLength(40);
      expect(result.weeks[0]?.workouts).toHaveLength(4);
      expect(result.weeks[0]?.targetWeeklyMinutes).toBe(180);
      expect(result.weeks[0]?.targetLongRunMinutes).toBe(70);
    }
  });

  it.each([
    ['foundation_3_day', { availableDays: confirmedDays3 }],
    ['established_4_day', { weeklyMinutes: 180, longestSessionMinutes: 70, availableDays: confirmedDays4 }],
  ] as const)('preserves the exact %s numerical prescription', (_band, overrides) => {
    const legacy = simulateHalfMarathonDraft(input(overrides));
    const current = simulateCurrentHalfMarathonDraft(input(overrides));
    expect(legacy).toMatchObject({ kind: 'simulation', policy: { version: '0.2.0-draft' } });
    expect(current).toMatchObject({ kind: 'simulation', policy: { version: '0.3.0-calendar-draft' } });
    expect(prescription(current)).toEqual(prescription(legacy));
  });

  it('retains the historical confirmed-limit contract while the successor records unassessed time', () => {
    expect(simulateHalfMarathonDraft(input())).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['unconfirmed_time_limit']) });
    const legacy = createHalfMarathonDraftPolicy('foundation_3_day');
    const current = createCurrentHalfMarathonDraftPolicy('foundation_3_day');
    expect(legacy).toMatchObject({ version: '0.2.0-draft', releaseAuthorized: false, requiredEvidence: expect.arrayContaining(['confirmed_day_limits']) });
    expect(current).toMatchObject({ version: '0.3.0-calendar-draft', releaseAuthorized: false, availabilityTimeRequirement: 'not_collected', missingCapabilities: expect.arrayContaining(['personal_time_availability_not_assessed']) });
    expect(current.requiredEvidence).not.toContain('confirmed_day_limits');
    expect(validateCurrentHalfMarathonPolicy()).toEqual([]);
  });

  it('preserves evidence, capacity, health, interruption, calendar and event-date guards', () => {
    expect(simulateCurrentHalfMarathonDraft(input({ weeklyMinutes: 50, longestSessionMinutes: 20 }))).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['requires_foundation_phase']) });
    expect(simulateCurrentHalfMarathonDraft(input({ weeklyEvidenceObservedAt: null }))).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['missing_weekly_evidence_confirmation']) });
    expect(simulateCurrentHalfMarathonDraft(input({ asOfDate: '2027-02-10' as const }))).toMatchObject({ kind: 'blocked', reasonCodes: ['outdated_evidence'] });
    expect(simulateCurrentHalfMarathonDraft(input({ healthConcern: true }))).toMatchObject({ kind: 'blocked', reasonCodes: ['health_hold'] });
    expect(simulateCurrentHalfMarathonDraft(input({ interruption: 'one_to_four_weeks' as const }))).toMatchObject({ kind: 'blocked', reasonCodes: ['interruption_requires_review'] });
    expect(simulateCurrentHalfMarathonDraft(input({ availableDays: calendarDays3.slice(0, 2) }))).toMatchObject({ kind: 'blocked', reasonCodes: ['two_day_half_marathon_policy_not_authored'] });
    expect(simulateCurrentHalfMarathonDraft(input({ fixedGoalDate: '2027-03-13' as const }))).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['fixed_goal_date_conflict']) });
    expect(simulateCurrentHalfMarathonDraft(input({ unavailableDates: ['2027-01-05', '2027-01-07', '2027-01-10'] as const }))).toMatchObject({ kind: 'blocked', reasonCodes: expect.arrayContaining(['unavailable_date']) });
  });

  it('supports a missing preferred long-run day while keeping exact policy provenance', () => {
    const result = simulateCurrentHalfMarathonDraft(input({ preferredLongRunDay: null }));
    expect(result).toMatchObject({ kind: 'simulation', diagnostics: { policyReference: 'runsensei.half_marathon.parameterized_personalization@0.3.0-calendar-draft' } });
    if (result.kind === 'simulation') {
      expect(result.weeks[0]?.workouts.every((workout) => workout.policyReferences.includes('runsensei.half_marathon.parameterized_personalization.foundation_3_day@0.3.0-calendar-draft'))).toBe(true);
    }
  });

  it('cannot be resolved as an authorized production policy', () => {
    const policy = createCurrentHalfMarathonDraftPolicy('foundation_3_day');
    expect(new MultiDistancePolicyRegistry([policy]).resolve(policy.id, policy.version, 'half_marathon', true)).toMatchObject({ kind: 'unavailable', code: 'policy_not_authorized' });
  });
});
