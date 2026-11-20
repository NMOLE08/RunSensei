import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Disclosure } from '@/design/components';
import type { generateFoundationProgram } from '@/domain/planning/foundationProgram';
import { durationSeconds } from '@/domain/planning/multiDistancePolicy';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { ResearchFoundationProgress, type ResearchOutcomeRequest } from './ResearchFoundationProgress';

type Program = Extract<ReturnType<typeof generateFoundationProgram>, { kind: 'foundation_program' }>;
const time = (seconds: number) => `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ''}`;
export function FoundationProgramPreview({ value: initial, selectedWeek, onSelectedWeekChange, onRegenerate, outcomeRequest }: { value: Program; selectedWeek?: number; onSelectedWeekChange?: (week: number, maximumWeek: number) => void; onRegenerate: () => void; outcomeRequest?: ResearchOutcomeRequest }) {
  const [viewed, setViewed] = useState<Program | null>(null);
  const value = viewed ?? initial;
  const [uncontrolledSelected, setUncontrolledSelected] = useState(1);
  const selected = Math.max(1, Math.min(value.weeks.length, selectedWeek ?? uncontrolledSelected));
  const setSelected = (next: number) => onSelectedWeekChange ? onSelectedWeekChange(Math.max(1, Math.min(value.weeks.length, next)), value.weeks.length) : setUncontrolledSelected(Math.max(1, Math.min(value.weeks.length, next)));
  const week = value.weeks[selected - 1]!;
  const workouts = value.workouts.filter(workout => workout.week === selected);
  const running = workouts.reduce((sum, workout) => sum + (durationSeconds(workout.steps.filter(step => step.kind === 'work')) ?? 0), 0);
  const total = workouts.reduce((sum, workout) => sum + (durationSeconds(workout.steps) ?? 0), 0);
  return <><Card><AppText variant="meta">PLAN PREVIEW</AppText><AppText variant="title">Build your running base</AppText><AppText>Working toward: {({ '5k': '5K', '10k': '10K', half_marathon: 'Half marathon', marathon: 'Marathon' })[value.goalFamily]}</AppText><AppText>Plan preview — not active yet. Check in again after this block before moving on.</AppText></Card><Card><AppText variant="title">Week {selected} of {value.weeks.length}{week.recoveryWeek ? ' · Recovery' : ''}</AppText><View style={{ flexDirection: 'row', gap: 12 }}><Button label="Previous week" disabled={selected === 1} onPress={() => setSelected(selected - 1)} /><Button label="Next week" disabled={selected === value.weeks.length} onPress={() => setSelected(selected + 1)} /></View><AppText>{time(running)} running · {time(total - running)} walking</AppText><AppText>{time(total)} total time</AppText></Card>{workouts.map(workout => <Card key={`${workout.week}:${workout.slot}`}><AppText variant="label">Workout {workout.slot} · {new Date(`${workout.date}T12:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })}</AppText><AppText>{workout.date} · {time(durationSeconds(workout.steps) ?? 0)}</AppText>{workout.steps.map((step,index) => <View key={index}><AppText variant="meta">{step.kind.toUpperCase()}</AppText><AppText>{step.instruction} · {step.target.kind === 'duration_seconds' ? time(step.target.value) : 'Unknown duration'}</AppText><AppText>{step.effort}</AppText></View>)}</Card>)}<Card><AppText>After Week {value.weeks.length}, review what you completed before a future phase is considered.</AppText>{__DEV__ && <Disclosure title="Technical details" summary="Developer-only validation details"><AppText>{value.policyReference}</AppText><AppText>Independent validation: {value.validation.valid ? 'passed' : 'failed'}</AppText>{value.warnings.map(w => <AppText key={w}>{w}</AppText>)}</Disclosure>}<Button label="Refresh preview" onPress={onRegenerate} /></Card>{experimental5kPreviewEnabled && <ResearchFoundationProgress program={value} onView={p => { setViewed(p); setSelected(1); }} outcomeRequest={outcomeRequest} />}</>;
}
