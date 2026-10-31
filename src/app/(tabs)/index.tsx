import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, DayStrip, Screen } from '@/design/components';
import { addCalendarDays } from '@/domain/calendar/operations';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { dayStripDates, localDateOnly, sessionsForDate } from '@/features/execution/viewModel';
import { SessionCard, StateCard } from '@/features/execution/components';
import { spacing } from '@/design/tokens';
import { trackerOnly } from '@/config/productMode';
import { TrackerHome } from '@/features/tracker/TrackerHome';

export default function HomeScreen() { return trackerOnly ? <TrackerHome /> : <TodayScreen />; }

function TodayScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>(); const selectedDate = date ?? localDateOnly(); const { status, data, error, reload } = useActivePlan();
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING ACTIVE PLAN…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Plan data unavailable">{error ?? 'The local plan database could not be read. No workout is shown until it is available.'}</StateCard></Screen>;
  if (!data) return <Screen><AppText variant="meta">TODAY / {selectedDate}</AppText><StateCard actionLabel="Create account or sign in" onAction={() => router.push('/auth' as Href)} title="Start your plan">New here? Create an account. Already have one? Sign in, then complete onboarding to create an explicitly labelled demo pathway.</StateCard></Screen>;
  if (data.snapshot.plan.recommendationState !== 'active') return <Screen><StateCard actionLabel="Review plan" onAction={() => router.push('/plan-review' as Href)} title={data.snapshot.plan.recommendationState === 'health_hold' ? 'Training is paused' : 'Plan needs review'}>{data.snapshot.plan.recommendationState === 'health_hold' ? 'A reported concern keeps workout recommendations paused. Normal reassessment will not clear it.' : 'Your recorded outcome is safe. Review the remaining schedule before workout recommendations resume.'}</StateCard></Screen>;
  const sessions = sessionsForDate(data.snapshot.assignments, data.resolutions, selectedDate, localDateOnly()); const phase = sessions[0]?.assignment.phase ?? 'rest'; const next = data.snapshot.assignments.find((item) => item.plannedDate >= selectedDate);
  return <Screen><AppText variant="meta">TODAY / {selectedDate}</AppText><View style={styles.dateNav}><Button label="Previous day" onPress={() => router.replace(`/?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, -1)}` as Href)} tone="secondary" /><Button label="Next day" onPress={() => router.replace(`/?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, 1)}` as Href)} tone="secondary" /></View><DayStrip selectedDate={selectedDate} days={dayStripDates(selectedDate)} /><AppText variant="meta">WEEK / {sessions[0]?.prescription.week ?? '—'} · PHASE / {phase.toUpperCase()}</AppText>{sessions.length > 0 ? sessions.map((session) => <SessionCard key={session.assignment.id} session={session} units={data.units} />) : selectedDate < localDateOnly() ? <StateCard title="Past day not logged">This day has no recorded resolution. It is not turned into today’s workout debt.</StateCard> : selectedDate > localDateOnly() ? <StateCard title="Future rest day">No session is scheduled for this selected future date.</StateCard> : <StateCard title="Recovery day">Rest is the intended action today. The next scheduled session is {next?.plannedDate ?? 'not available'}.</StateCard>} {next && <View style={styles.next}><AppText variant="meta">NEXT RELEVANT ACTION</AppText><AppText>{next.plannedDate} · {next.role}</AppText></View>}</Screen>;
}
const styles = StyleSheet.create({ dateNav: { flexDirection: 'row', gap: spacing.xs }, next: { gap: spacing.xs, paddingVertical: spacing.sm } });
