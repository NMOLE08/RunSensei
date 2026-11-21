import { useState } from 'react';
import { AppText, Button, Card, Disclosure } from '@/design/components';
import type { generateFoundationProgram } from '@/domain/planning/foundationProgram';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { ResearchFoundationProgress, type ResearchOutcomeRequest } from './ResearchFoundationProgress';
import { PlanSummaryCard, PlanWeekCalendar, PlanWorkoutSummaryCard } from './ResearchPlanComponents';
import { presentPolicyResearchPlan } from './researchPlanPresentation';

type Program = Extract<ReturnType<typeof generateFoundationProgram>, { kind: 'foundation_program' }>;

export function FoundationProgramPreview({ value: initial, selectedWeek, onSelectedWeekChange, onRegenerate, outcomeRequest }: { value: Program; selectedWeek?: number; onSelectedWeekChange?: (week: number, maximumWeek: number) => void; onRegenerate: () => void; outcomeRequest?: ResearchOutcomeRequest }) {
  const [viewed, setViewed] = useState<Program | null>(null);
  const value = viewed ?? initial;
  const plan = presentPolicyResearchPlan({ id: `${value.policyReference}:${value.workouts[0]?.date ?? ''}`, kind: 'foundation', goal: value.goalFamily, title: 'Foundation preparation — 4 weeks', purpose: 'A short, authored preparation block for building a repeatable running base.', policyReference: value.policyReference, weeks: value.weeks.length, trainingFrequency: value.weeks[0]?.workouts.length ?? null, transition: 'Review your progress after this block. Later phases are not yet scheduled.', workouts: value.workouts });
  const [uncontrolledWeek, setUncontrolledWeek] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const week = Math.max(1, Math.min(plan.weeks, selectedWeek ?? uncontrolledWeek));
  const setWeek = (next: number) => onSelectedWeekChange ? onSelectedWeekChange(Math.max(1, Math.min(plan.weeks, next)), plan.weeks) : setUncontrolledWeek(Math.max(1, Math.min(plan.weeks, next)));
  const workouts = plan.workouts.filter((workout) => workout.week === week);
  const recovery = value.weeks[week - 1]?.recoveryWeek ? 'Recovery week' : null;
  return <>
    <PlanSummaryCard plan={plan} status="Research preview — not an active training plan." />
    <Card><AppText variant="label">Working toward: {plan.goalLabel}</AppText><AppText>This is a preparation block, not your complete race training plan.</AppText></Card>
    <PlanWeekCalendar plan={plan} week={week} onWeekChange={setWeek} selectedWorkoutId={expanded} onSelectWorkout={(id) => setExpanded((current) => current === id ? null : id)} recoveryLabel={recovery} />
    {workouts.map((workout) => <PlanWorkoutSummaryCard key={workout.id} workout={workout} expanded={expanded === workout.id} onToggle={() => setExpanded((current) => current === workout.id ? null : workout.id)} />)}
    <Card><AppText variant="meta">RESEARCH PREVIEW CONTROLS</AppText>{__DEV__ && <Disclosure title="Technical details" summary="Developer-only validation details"><AppText>{value.policyReference}</AppText><AppText>Independent validation: {value.validation.valid ? 'passed' : 'failed'}</AppText>{value.warnings.map((warning) => <AppText key={warning}>{warning}</AppText>)}</Disclosure>}<Button label="Refresh preview" tone="secondary" onPress={onRegenerate} /></Card>
    {experimental5kPreviewEnabled && <ResearchFoundationProgress program={value} onView={(next) => { setViewed(next); setExpanded(null); setWeek(1); }} outcomeRequest={outcomeRequest} />}
  </>;
}
