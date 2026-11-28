import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import type { ScheduledPolicyWorkout } from '@/domain/planning/multiDistancePolicy';
import { durationSeconds } from '@/domain/planning/multiDistancePolicy';
import { formatSeconds, presentPreviewTimeline, presentPreviewWorkout, type WorkoutAccent, type WorkoutTimelineSection } from './workoutPresentation';

export type ResearchProgrammeKind = 'beginner_5k' | 'foundation' | 'half_marathon' | '10k' | 'marathon';

export type ResearchPlanWorkout = Readonly<{
  id: string;
  date: string;
  week: number;
  title: string;
  category: string;
  summary: string;
  target: string | null;
  accent: WorkoutAccent;
  timeline: readonly WorkoutTimelineSection[];
}>;

export type ResearchPlanPresentation = Readonly<{
  id: string;
  kind: ResearchProgrammeKind;
  goalLabel: string;
  title: string;
  purpose: string;
  policyReference: string;
  researchOnly: true;
  weeks: number;
  trainingFrequency: number | null;
  transition: string | null;
  workouts: readonly ResearchPlanWorkout[];
}>;

export type PlanCalendarDay = Readonly<{ date: string; weekday: number; workout: ResearchPlanWorkout | null }>;

const goalLabels: Record<string, string> = { '5k': '5K', '10k': '10K', half_marathon: 'Half marathon', marathon: 'Marathon' };

export function displayGoal(goal: string): string {
  return goalLabels[goal] ?? goal.replaceAll('_', ' ');
}

export function presentBeginner5kPlan(value: { inputFingerprint: string; pathway: { id: string; version: string }; scheduleAnchor: string; sessions: readonly First5kDraftSession[]; feasibility: { selectedWeekdays: readonly number[] } }): ResearchPlanPresentation {
  return {
    id: `${value.inputFingerprint}:${value.pathway.id}@${value.pathway.version}:${value.scheduleAnchor}:${value.sessions[0]?.date ?? ''}`,
    kind: 'beginner_5k', goalLabel: '5K', title: 'Beginner 5K · Run/Walk',
    purpose: 'Twelve authored sessions paced by effort, not pace targets.', policyReference: `${value.pathway.id}@${value.pathway.version}`,
    researchOnly: true, weeks: 12, trainingFrequency: value.feasibility.selectedWeekdays.length, transition: null,
    workouts: value.sessions.map((session) => {
      const workout = presentPreviewWorkout(session);
      return { id: `${session.week}:${session.code}`, date: session.date, week: session.week, ...workout, timeline: presentPreviewTimeline(session) };
    }),
  };
}

export function presentPolicyResearchPlan(input: { id: string; kind: Exclude<ResearchProgrammeKind, 'beginner_5k'>; goal: string; title: string; purpose: string; policyReference: string; weeks: number; trainingFrequency: number | null; transition: string | null; workouts: readonly ScheduledPolicyWorkout[] }): ResearchPlanPresentation {
  return {
    id: input.id, kind: input.kind, goalLabel: displayGoal(input.goal), title: input.title, purpose: input.purpose,
    policyReference: input.policyReference, researchOnly: true, weeks: input.weeks, trainingFrequency: input.trainingFrequency,
    transition: input.transition,
    workouts: input.workouts.map((workout) => presentPolicyWorkout(workout)),
  };
}

export function presentPolicyWorkout(workout: ScheduledPolicyWorkout): ResearchPlanWorkout {
  const total = durationSeconds(workout.steps);
  const hasRecovery = workout.steps.some((step) => step.kind === 'recovery');
  const category = workout.role === 'event' ? 'Completion event' : hasRecovery ? 'Run / walk' : workout.role === 'long' ? 'Longer easy run' : workout.role === 'quality' ? 'Speed session' : workout.role === 'tempo' ? 'Tempo running' : 'Easy running';
  const title = workout.role === 'event' ? 'Completion event' : workout.role === 'long' ? 'Longer easy run' : workout.role === 'quality' ? 'Speed session' : workout.role === 'tempo' ? 'Tempo run' : hasRecovery ? 'Run / walk intervals' : 'Easy run';
  const accent: WorkoutAccent = workout.role === 'event' ? 'event' : workout.role === 'quality' || hasRecovery ? 'coral' : workout.role === 'long' ? 'moss' : 'lavender';
  return {
    id: `${workout.week}:${workout.slot}:${workout.date}`, date: workout.date, week: workout.week, title, category,
    summary: workout.purpose, target: workout.target.kind === 'duration_seconds' ? formatSeconds(workout.target.value) : workout.target.kind === 'distance_meters' ? `${(workout.target.value / 1000).toFixed(workout.target.value % 1000 === 0 ? 0 : 3)} km` : total === null ? null : formatSeconds(total),
    accent, timeline: presentPolicyTimeline(workout),
  };
}

export function presentPolicyTimeline(workout: ScheduledPolicyWorkout): readonly WorkoutTimelineSection[] {
  const sections: { id: string; title: string; detail: string | null; rows: { id: string; primary: string; secondary: string | null; indicator: 'RUN' | 'WALK' | 'REST' | 'EVENT' | 'STEP' }[] }[] = [];
  for (const [index, step] of workout.steps.entries()) {
    const id = step.kind === 'warmup' ? 'warmup' : step.kind === 'cooldown' ? 'cooldown' : 'session';
    const title = id === 'warmup' ? 'Warm-up' : id === 'cooldown' ? 'Cool-down' : workout.role === 'event' ? 'Completion event' : 'Session';
    let section = sections.at(-1);
    if (!section || section.id !== id) { section = { id, title, detail: null, rows: [] }; sections.push(section); }
    const target = step.target.kind === 'duration_seconds' ? formatSeconds(step.target.value) : step.target.kind === 'distance_meters' ? `${(step.target.value / 1000).toFixed(2)} km` : 'Unknown target';
    const indicator = step.kind === 'event' ? 'EVENT' : step.kind === 'work' ? 'RUN' : step.kind === 'recovery' ? 'REST' : step.kind === 'warmup' || step.kind === 'cooldown' ? 'WALK' : 'STEP';
    section.rows.push({ id: `${index}:${step.kind}`, primary: `${target} · ${step.kind === 'work' ? 'Running' : step.kind === 'recovery' ? 'Walking recovery' : step.kind === 'warmup' ? 'Warm-up walk' : 'Cool-down walk'}`, secondary: [step.instruction, step.effort].filter(Boolean).join(' · ') || null, indicator });
  }
  return sections;
}

export function calendarDaysForPlan(workouts: readonly ResearchPlanWorkout[], week: number): readonly PlanCalendarDay[] {
  const inWeek = workouts.filter((workout) => workout.week === week);
  const first = inWeek[0]?.date;
  if (!first) return [];
  const start = new Date(`${first}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, weekday) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + weekday);
    const dateOnly = date.toISOString().slice(0, 10);
    return { date: dateOnly, weekday, workout: inWeek.find((item) => item.date === dateOnly) ?? null };
  });
}

export function programmeSelectionIdentity(identity: string, programme: Pick<ResearchPlanPresentation, 'id' | 'kind' | 'policyReference'>): string {
  return `${identity}:${programme.kind}:${programme.policyReference}:${programme.id}`;
}
