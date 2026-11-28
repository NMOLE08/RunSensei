import { simulateFirst5kDraft } from '@/domain/planning/first5kPolicyPack';
import { generateCurrentFoundationProgram } from '@/domain/planning/foundationProgram';
import { simulateHalfMarathonDraft } from '@/domain/planning/halfMarathonDraft';
import { calendarDaysForPlan, presentBeginner5kPlan, presentPolicyResearchPlan, presentPolicyWorkout, programmeSelectionIdentity } from '@/features/execution/researchPlanPresentation';

describe('research plan presentation', () => {
  it('retains all authored beginner 5K sessions and their ordered targets', () => {
    const simulation = simulateFirst5kDraft('2026-11-02', [0, 3, 5]);
    if (simulation.kind !== 'draft_simulation') throw new Error('Expected draft simulation');
    const plan = presentBeginner5kPlan({ inputFingerprint: 'fingerprint', pathway: { id: 'true_beginner_fixed_12_week_run_walk', version: '1' }, scheduleAnchor: '2026-11-02', sessions: simulation.sessions, feasibility: { selectedWeekdays: [0, 3, 5] } });
    expect(plan.workouts).toHaveLength(simulation.sessions.length);
    expect(plan.workouts[0]?.timeline.flatMap((section) => section.rows)).toHaveLength(simulation.sessions[0]?.steps.length ?? 0);
    expect(calendarDaysForPlan(plan.workouts, 1)).toHaveLength(7);
  });

  it('uses the actual foundation schedule without adding sessions or replacing its steps', () => {
    const result = generateCurrentFoundationProgram({ context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: false, healthConcern: false, healthRelatedInterruption: false, requestedFrequency: 3 }, { ownerId: 'synthetic', goalFamily: 'half_marathon', startDate: '2027-01-04', availableDays: [1, 3, 6].map((weekday) => ({ weekday, maxMinutes: 45, confirmedByRunner: true })), unavailableDates: [], preferredLongRunDay: null, fixedGoalDate: null });
    if (result.kind !== 'foundation_program') throw new Error('Expected foundation programme');
    const plan = presentPolicyResearchPlan({ id: 'foundation', kind: 'foundation', goal: result.goalFamily, title: 'Foundation preparation — 4 weeks', purpose: 'test', policyReference: result.policyReference, weeks: result.weeks.length, trainingFrequency: 2, transition: null, workouts: result.workouts });
    expect(plan.workouts).toHaveLength(result.workouts.length);
    expect(plan.workouts[0]?.timeline.flatMap((section) => section.rows)).toHaveLength(result.workouts[0]?.steps.length ?? 0);
  });

  it('keeps programme selection distinct when policy or schedule identity changes', () => {
    const current = programmeSelectionIdentity('account:context', { kind: 'half_marathon', policyReference: 'policy@1', id: '2026-11-02' });
    const replacement = programmeSelectionIdentity('account:context', { kind: 'half_marathon', policyReference: 'policy@2', id: '2026-11-02' });
    expect(current).not.toBe(replacement);
  });

  it('adapts every authored workout in the supported ten-week half-marathon simulation', () => {
    const result = simulateHalfMarathonDraft({ ownerId: 'fixture', weeklyMinutes: 110, longestSessionMinutes: 45, comfortableRunMinutes: 40, weeklyEvidenceObservedAt: '2027-01-02', longestSessionDate: '2027-01-02', asOfDate: '2027-01-04', interruption: 'none', healthConcern: false, availableDays: [{ weekday: 1, maxMinutes: 75, confirmedByRunner: true }, { weekday: 3, maxMinutes: 75, confirmedByRunner: true }, { weekday: 6, maxMinutes: 100, confirmedByRunner: true }], unavailableDates: [], preferredLongRunDay: 6, startDate: '2027-01-04', fixedGoalDate: null });
    if (result.kind !== 'simulation') throw new Error('Expected half-marathon simulation');
    const plan = presentPolicyResearchPlan({ id: 'half', kind: 'half_marathon', goal: 'half_marathon', title: 'Half marathon', purpose: 'test', policyReference: `${result.policy.id}@${result.policy.version}`, weeks: result.weeks.length, trainingFrequency: result.weeks[0]?.workouts.length ?? null, transition: null, workouts: result.weeks.flatMap((week) => week.workouts) });
    expect(plan.weeks).toBe(10);
    expect(plan.workouts).toHaveLength(result.weeks.flatMap((week) => week.workouts).length);
    expect(plan.workouts.at(-1)?.target).toContain('km');
  });

  it('presents quality, tempo and event roles with meaningful labels', () => {
    const base = { week: 1, date: '2027-01-05' as const, phase: 'training', purpose: 'Session', protected: false, policyReferences: ['test@1'] };
    const timed = { kind: 'work' as const, instruction: 'Run', purpose: 'quality', effort: 'controlled', target: { kind: 'duration_seconds' as const, value: 1800 }, repeats: 1 };
    expect(presentPolicyWorkout({ ...base, slot: 'quality', role: 'quality', target: timed.target, steps: [timed] }).title).toBe('Speed session');
    expect(presentPolicyWorkout({ ...base, slot: 'tempo', role: 'tempo', target: timed.target, steps: [timed] }).title).toBe('Tempo run');
    const event = presentPolicyWorkout({ ...base, slot: 'event', role: 'event', phase: 'event', target: { kind: 'distance_meters', value: 10_000 }, steps: [{ kind: 'event', instruction: '10K', purpose: 'event', effort: null, target: { kind: 'distance_meters', value: 10_000 }, repeats: 1 }] });
    expect(event.timeline[0]?.rows[0]?.indicator).toBe('EVENT');
  });
});
