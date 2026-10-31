import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/design/components';
import { formatTarget } from '@/domain/training/prescription';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { localDateOnly, sessionsForDate } from '@/features/execution/viewModel';
import { ExecutionStateLabel, StateCard } from '@/features/execution/components';

export default function WorkoutDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>(); const { status, data, error, reload } = useActivePlan();
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING WORKOUT…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Workout unavailable">{error ?? 'Local data could not be read.'}</StateCard></Screen>;
  if (data?.snapshot.plan.recommendationState !== 'active') return <Screen><StateCard title="Workout unavailable">This revision is not active for execution.</StateCard><Button label="Back to plan" onPress={() => router.back()} /></Screen>;
  const assignment = data?.snapshot.assignments.find((item) => item.id === sessionId); const session = assignment && data ? sessionsForDate([assignment], data.resolutions, assignment.plannedDate, localDateOnly())[0] : undefined;
  if (!data || !session) return <Screen><StateCard title="Workout not available">This workout is missing from the current active revision or its authored prescription is unavailable.</StateCard><Button label="Back to plan" onPress={() => router.back()} /></Screen>;
  const target = formatTarget(session.prescription, data.units); return <Screen><AppText variant="meta">{session.assignment.plannedDate} / {session.assignment.phase.toUpperCase()}</AppText><Card><ExecutionStateLabel state={session.state} /><AppText variant="title">{session.assignment.role.toUpperCase()} RUN</AppText>{target && <AppText accessibilityLabel={`Prescribed target ${target}`} variant="display">{target}</AppText>}<AppText>{session.prescription.purpose}</AppText><AppText>{session.prescription.effortCue}</AppText></Card><Card><AppText variant="meta">AUTHORED STEPS</AppText>{session.prescription.steps.map((step, index) => <AppText key={`${step.label}-${index}`}>{step.label}: {step.instruction}</AppText>)}</Card><Card><AppText variant="meta">APPROVED ALTERNATIVES</AppText>{session.prescription.approvedAlternatives.length === 0 ? <AppText>No authored alternatives.</AppText> : session.prescription.approvedAlternatives.map((alternative) => <AppText key={alternative}>{alternative}</AppText>)}</Card><Button label="Back to plan" onPress={() => router.back()} tone="secondary" />{session.state !== 'completed' && <Button label="Start workout" onPress={() => router.push({ pathname: '/training/[sessionId]', params: { sessionId: session.assignment.id } })} />}</Screen>;
}
