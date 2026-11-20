import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, DayStrip, Screen } from '@/design/components';
import { addCalendarDays } from '@/domain/calendar/operations';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { dayStripDates, localDateOnly, sessionsForDate, weekProgressSummary } from '@/features/execution/viewModel';
import { SessionCard, StateCard } from '@/features/execution/components';
import { trackerOnly } from '@/config/productMode';
import { TrackerHome } from '@/features/tracker/TrackerHome';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { colors, spacing } from '@/design/tokens';

export default function HomeScreen() { return trackerOnly ? <TrackerHome /> : <TodayScreen />; }

function TodayScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>(); const selectedDate = date ?? localDateOnly(); const { status, data, error, reload } = useActivePlan();
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING ACTIVE PLAN…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Plan data unavailable">{error ?? 'The local plan database could not be read. No workout is shown until it is available.'}</StateCard></Screen>;
  if (!data) return <Screen><View style={styles.hero}><AppText variant="meta">RUNSENSEI · TODAY</AppText><AppText variant="title">Make today yours.</AppText><AppText style={styles.heroCopy}>Start with an activity, or create an account to explore the available plan setup.</AppText><AnimatedIcon name="home" size={48} /></View><StateCard actionLabel="Create account or sign in" onAction={() => router.push('/auth' as Href)} title="Your plan starts here">New here? Create an account. Already have one? Sign in, then complete onboarding.</StateCard><Button label="Start a run" icon={<AnimatedIcon name="location" size={24} />} onPress={() => router.push('/run?mode=run' as Href)} /></Screen>;
  if (data.snapshot.plan.recommendationState !== 'active') return <Screen><StateCard actionLabel="Review plan" onAction={() => router.push('/plan-review' as Href)} title={data.snapshot.plan.recommendationState === 'health_hold' ? 'Training is paused' : 'Plan needs review'}>{data.snapshot.plan.recommendationState === 'health_hold' ? 'A reported concern keeps workout recommendations paused. Normal reassessment will not clear it.' : 'Your recorded outcome is safe. Review the remaining schedule before workout recommendations resume.'}</StateCard></Screen>;
  const sessions = sessionsForDate(data.snapshot.assignments, data.resolutions, selectedDate, localDateOnly()); const phase = sessions[0]?.assignment.phase ?? 'recovery'; const next = data.snapshot.assignments.find((item) => item.plannedDate >= selectedDate); const weekSummary = weekProgressSummary(data.snapshot.assignments, data.resolutions, selectedDate, localDateOnly());
  return <Screen>
    <View style={styles.hero}><View style={styles.heroTop}><View><AppText variant="meta">TODAY · {selectedDate}</AppText><AppText variant="title">{sessions.length ? 'Your session is ready.' : 'Room to recover.'}</AppText></View><AnimatedIcon name="home" size={42} /></View><AppText style={styles.heroCopy}>{sessions.length ? 'Check your session details, then head out when you are ready.' : 'There is no workout scheduled for this date. Rest is part of the training week.'}</AppText><View style={styles.weekSummary}><AppText variant="label">{weekSummary.scheduled ? `${weekSummary.completed} / ${weekSummary.scheduled}` : '—'}</AppText><AppText variant="meta">SESSIONS COMPLETE THIS WEEK</AppText></View></View>
    <View style={styles.dateNav}><Button label="Previous day" onPress={() => router.replace(`/?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, -1)}` as Href)} tone="secondary" /><Button label="Next day" onPress={() => router.replace(`/?date=${addCalendarDays(selectedDate as `${number}-${number}-${number}`, 1)}` as Href)} tone="secondary" /></View>
    <DayStrip selectedDate={selectedDate} days={dayStripDates(selectedDate)} />
    <View style={styles.metaRow}><AppText variant="meta">WEEK {sessions[0]?.prescription.week ?? '—'}</AppText><AppText variant="meta">{phase.toUpperCase()} PHASE</AppText></View>
    {sessions.length > 0 ? sessions.map((session) => <SessionCard key={session.assignment.id} session={session} units={data.units} />) : selectedDate < localDateOnly() ? <StateCard title="Past day not logged">This day has no recorded outcome. It is not turned into workout debt.</StateCard> : selectedDate > localDateOnly() ? <StateCard title="Future day">No session is scheduled on this selected date.</StateCard> : <StateCard title="Recovery day">Rest is the intended action today. Your next scheduled session is {next?.plannedDate ?? 'not available'}.</StateCard>}
    <Card><AppText variant="meta">NEXT SESSION</AppText>{next ? <><AppText variant="title">{next.role.toUpperCase()} RUN</AppText><AppText>{next.plannedDate}</AppText><Button label="Open training plan" tone="secondary" onPress={() => router.push('/plan' as Href)} /></> : <AppText>No upcoming session is available in the active plan.</AppText>}</Card>
    <Button label="Start a run" icon={<AnimatedIcon name="location" size={24} />} onPress={() => router.push('/run?mode=run' as Href)} />
  </Screen>;
}
const styles = StyleSheet.create({ dateNav: { flexDirection: 'row', gap: spacing.xs }, hero: { backgroundColor: colors.accentWash, borderRadius: 28, gap: spacing.md, padding: spacing.lg }, heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, heroCopy: { color: colors.mutedInk }, weekSummary: { alignItems: 'baseline', borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm }, metaRow: { flexDirection: 'row', justifyContent: 'space-between' } });
