import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { AppText, Button, Card, PageHeader, Screen } from '@/design/components';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { localDateOnly, sessionsForDate } from '@/features/execution/viewModel';
import { ExecutionStateLabel, StateCard } from '@/features/execution/components';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { colors, radius, spacing } from '@/design/tokens';
import { presentAuthoredTimeline, presentAuthoredWorkout } from '@/features/execution/workoutPresentation';
import { WorkoutStepTimeline } from '@/features/execution/WorkoutStepTimeline';

export default function WorkoutDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { status, data, error, reload } = useActivePlan();
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING WORKOUT…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Workout unavailable">{error ?? 'Local data could not be read.'}</StateCard></Screen>;
  if (data?.snapshot.plan.recommendationState !== 'active') return <Screen><StateCard title="Workout unavailable">This revision is not active for execution.</StateCard><Button label="Back to plan" onPress={() => router.back()} /></Screen>;
  const assignment = data?.snapshot.assignments.find((item) => item.id === sessionId);
  const session = assignment && data ? sessionsForDate([assignment], data.resolutions, assignment.plannedDate, localDateOnly())[0] : undefined;
  if (!data || !session) return <Screen><StateCard title="Workout not available">This workout is missing from the current active revision or its authored prescription is unavailable.</StateCard><Button label="Back to plan" onPress={() => router.back()} /></Screen>;
  const workout = presentAuthoredWorkout(session.prescription, session.assignment.role, data.units);
  const timeline = presentAuthoredTimeline(session.prescription.steps, data.units);
  const date = new Date(`${session.assignment.plannedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return <Screen>
    <PageHeader eyebrow={date.toUpperCase()} title={workout.title} description={workout.category} />
    <Card style={styles.hero}>
      <View style={[styles.accent, accentStyle(workout.accent)]} />
      <View style={styles.heroTop}><ExecutionStateLabel state={session.state} />{workout.target && <AppText accessibilityLabel={`Prescribed target ${workout.target}`} variant="title" style={styles.target}>{workout.target}</AppText>}</View>
      <AppText variant="section">{session.prescription.purpose}</AppText>
      <View style={styles.effort}><AppText variant="meta">EFFORT</AppText><AppText>{session.prescription.effortCue}</AppText></View>
    </Card>
    <View style={styles.sectionHeading}><AppText variant="section">Your workout</AppText><AppText variant="meta">{session.prescription.steps.length} AUTHORED STEPS</AppText></View>
    <WorkoutStepTimeline accent={workout.accent} sections={timeline} />
    {session.prescription.approvedAlternatives.length > 0 && <Card><AppText variant="meta">APPROVED ALTERNATIVES</AppText>{session.prescription.approvedAlternatives.map((alternative) => <AppText key={alternative}>{alternative}</AppText>)}</Card>}
    {session.state !== 'completed' && <Button label="Start workout" icon={<AnimatedIcon name="walk" size={24} />} onPress={() => router.push({ pathname: '/training/[sessionId]', params: { sessionId: session.assignment.id } })} />}
    <Button label="Back to plan" onPress={() => router.back()} tone="secondary" />
  </Screen>;
}

function accentStyle(accent: ReturnType<typeof presentAuthoredWorkout>['accent']): ViewStyle { return ({ moss: { backgroundColor: colors.moss }, coral: { backgroundColor: colors.coral }, butter: { backgroundColor: colors.butter }, lavender: { backgroundColor: '#9877B8' }, event: { backgroundColor: colors.ink } })[accent]; }
const styles = StyleSheet.create({ hero: { gap: spacing.md, overflow: 'hidden', paddingTop: spacing.lg, position: 'relative' }, accent: { height: 6, left: 0, position: 'absolute', right: 0, top: 0 }, heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, target: { color: colors.ink, textAlign: 'right' }, effort: { backgroundColor: colors.canvasRaised, borderRadius: radius.medium, gap: 3, padding: spacing.sm }, sectionHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' } });
