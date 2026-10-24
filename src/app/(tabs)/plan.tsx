import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Screen } from '@/design/components';
import { addCalendarDays } from '@/domain/calendar/operations';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { assignmentsForWeek, localDateOnly, sessionsForDate } from '@/features/execution/viewModel';
import { SessionCard, StateCard } from '@/features/execution/components';
import { spacing } from '@/design/tokens';

export default function PlanScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>(); const selectedDate = date ?? localDateOnly(); const { status, data, error, reload } = useActivePlan();
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING WEEKLY AGENDA…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Plan data unavailable">{error ?? 'The agenda cannot be read right now.'}</StateCard></Screen>;
  if (!data) return <Screen><AppText variant="meta">PLAN</AppText><StateCard title="No active plan">A weekly agenda appears after a supported plan is activated.</StateCard></Screen>;
  if (data.snapshot.plan.recommendationState !== 'active') return <Screen><StateCard title="Plan needs review">This persisted revision is not active for execution, so an agenda is not shown.</StateCard></Screen>;
  const week = assignmentsForWeek(data.snapshot.assignments, selectedDate); return <Screen><AppText variant="meta">WEEK OF {week[0]?.plannedDate ?? selectedDate}</AppText><View style={styles.nav}><Button label="Previous week" onPress={() => router.replace(`/plan?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, -7)}` as Href)} tone="secondary" /><Button label="Next week" onPress={() => router.replace(`/plan?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, 7)}` as Href)} tone="secondary" /></View>{week.length === 0 ? <StateCard title="No sessions this week">No active assignments fall in this week.</StateCard> : week.map((assignment) => { const session = sessionsForDate([assignment], data.resolutions, assignment.plannedDate, localDateOnly())[0]; return session ? <SessionCard key={assignment.id} session={session} units={data.units} showMenu /> : <StateCard key={assignment.id} title="Prescription unavailable">This assignment cannot be displayed safely.</StateCard>; })}</Screen>;
}
const styles = StyleSheet.create({ nav: { flexDirection: 'row', gap: spacing.xs } });
