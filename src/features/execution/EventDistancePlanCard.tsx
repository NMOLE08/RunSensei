import { useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { AppText, Button, Card } from '@/design/components';
import type { EventDistanceCandidate } from '@/application/eventDistanceCandidate';
import { PlanSummaryCard, PlanWeekCalendar, PlanWorkoutSummaryCard } from './ResearchPlanComponents';
import { presentPolicyResearchPlan } from './researchPlanPresentation';

const reasonCopy: Record<string, string> = {
  finish_objective_required: 'This authored programme currently supports completing the event. Performance and target-time variants still need separate authored policies.',
  current_training_required: 'Tell Torto whether you are currently training before this event programme can be selected.',
  current_capacity_not_confirmed: 'Confirm that your current running details describe what you can repeat today.',
  weekly_running_below_candidate_entry: 'Your recent weekly running is below this programme’s entry requirement.',
  longest_session_below_candidate_entry: 'Your recent longest session is below this programme’s entry requirement.',
  comfortable_running_below_candidate_entry: 'Your comfortable continuous-running evidence is below this programme’s entry requirement.',
  four_training_days_required: 'Choose at least four available training days for this programme.',
  assessment_assessment_outdated: 'Your saved answers changed after assessment. Review your starting point again.',
  assessment_insufficient_information: 'Required assessment information is incomplete.',
  assessment_health_hold: 'A health-related answer requires review before Torto can show this programme.',
  health_hold: 'A health-related answer requires review before Torto can show this programme.',
};

export function EventDistancePlanCard({ value, selectedWeek, onSelectedWeekChange, onRegenerate }: { value: EventDistanceCandidate; selectedWeek: number; onSelectedWeekChange: (week: number, maximumWeek: number) => void; onRegenerate: () => void }) {
  if (value.kind === 'blocked') return <Blocked value={value} onRegenerate={onRegenerate} />;
  return <Calendar value={value} selectedWeek={selectedWeek} onSelectedWeekChange={onSelectedWeekChange} />;
}

function Calendar({ value, selectedWeek, onSelectedWeekChange }: { value: Extract<EventDistanceCandidate, { kind: 'plan' }>; selectedWeek: number; onSelectedWeekChange: (week: number, maximumWeek: number) => void }) {
  const plan = useMemo(() => presentPolicyResearchPlan({
    id: `${value.policy.id}@${value.policy.version}:${value.weeks[0]?.workouts[0]?.date ?? ''}`,
    kind: value.goalFamily,
    goal: value.goalFamily,
    title: value.title,
    purpose: value.goalFamily === '10k' ? 'A twelve-week event programme scheduled from your saved running profile.' : 'An eighteen-week marathon programme scheduled from your saved running profile.',
    policyReference: `${value.policy.id}@${value.policy.version}`,
    weeks: value.weeks.length,
    trainingFrequency: null,
    transition: null,
    workouts: value.weeks.flatMap((week) => week.workouts),
  }), [value]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const week = Math.max(1, Math.min(plan.weeks, selectedWeek));
  const current = value.weeks[week - 1];
  const workouts = plan.workouts.filter((workout) => workout.week === week);
  return <>
    <PlanSummaryCard plan={plan} status="Personalized calendar generated from your saved profile." />
    <PlanWeekCalendar plan={plan} week={week} onWeekChange={(next) => onSelectedWeekChange(next, plan.weeks)} selectedWorkoutId={expanded} onSelectWorkout={(id) => setExpanded((currentId) => currentId === id ? null : id)} recoveryLabel={current?.recoveryWeek ? 'Recovery week' : current?.taper ? 'Taper' : null} />
    {workouts.map((workout) => <PlanWorkoutSummaryCard key={workout.id} workout={workout} expanded={expanded === workout.id} onToggle={() => setExpanded((currentId) => currentId === workout.id ? null : workout.id)} />)}
  </>;
}

function Blocked({ value, onRegenerate }: { value: Extract<EventDistanceCandidate, { kind: 'blocked' }>; onRegenerate: () => void }) {
  const currentContext = value.reasonCodes.includes('current_training_required');
  const health = value.reasonCodes.some((reason) => reason.includes('health'));
  const objective = value.reasonCodes.includes('finish_objective_required');
  const route = health
    ? '/onboarding/running?returnTo=/plan&focus=recent-interruption'
    : objective
      ? '/onboarding/goal?returnTo=/plan&focus=training-objective'
      : currentContext
        ? '/onboarding/running?returnTo=/plan&focus=current-training-context&part=running-context'
        : '/onboarding/running?returnTo=/plan&focus=running-evidence-confirmation';
  return <Card><AppText variant="meta">TRAINING PLAN · ACTION REQUIRED</AppText><AppText variant="title">Review your current running profile</AppText>{value.reasonCodes.map((reason) => <AppText key={reason}>{reasonCopy[reason] ?? reason.replaceAll('_', ' ')}</AppText>)}<Button label="Review the relevant answers" tone="secondary" onPress={() => router.push(route as Href)} /><Button label="Check plan again" tone="secondary" onPress={onRegenerate} /></Card>;
}
