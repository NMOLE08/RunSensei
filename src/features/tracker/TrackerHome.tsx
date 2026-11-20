import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ContourDecoration, PageHeader, Screen, SectionHeader } from '@/design/components';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { colors, spacing } from '@/design/tokens';
import { StateCard } from '@/features/execution/components';
import { useTrackerHistory } from '@/features/tracker/useTrackerHistory';
import { usePlanAvailability } from '@/features/execution/usePlanAvailability';
import { PendingResearchCheckinCard } from '@/features/tracker/PendingResearchCheckinCard';
import { consumerStatusForPlanAvailability, presentPlanAvailability } from '@/features/execution/planAvailabilityPresentation';

function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function weekStartDate(value: Date) { const start = new Date(value.getFullYear(), value.getMonth(), value.getDate()); const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); return start; }
function durationLabel(seconds: number) { const minutes = Math.floor(seconds / 60); const remainder = seconds % 60; return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`; }

export function TrackerHome() {
  const history = useTrackerHistory();
  const planAvailability = usePlanAvailability();
  const today = new Date();
  const startDate = localDate(weekStartDate(today));
  const endDate = localDate(today);
  const thisWeek = history.items.filter((item) => { const date = localDate(new Date(item.startedAtMs)); return date >= startDate && date <= endDate; });
  const runs = thisWeek.filter((item) => item.mode === 'run');
  const walks = thisWeek.filter((item) => item.mode === 'walk');
  const activeTime = thisWeek.reduce((total, item) => total + item.activeSeconds, 0);
  const gpsItems = thisWeek.filter((item) => item.gps && item.distanceMeters !== null);
  const gpsDistance = gpsItems.reduce((total, item) => total + (item.distanceMeters ?? 0), 0);

  return <Screen>
    <PageHeader eyebrow="RUNSENSEI · TODAY" title="Ready when you are." description="Your next run starts with one tap." />
    {history.status === 'ready' && history.pendingCheckins.map(item => <PendingResearchCheckinCard key={`${item.activityId}:${item.assignmentId}`} checkin={item} />)}
    <View style={styles.hero}><ContourDecoration /><View style={styles.heroTop}><View style={styles.heroIcon}><AnimatedIcon name="location" size={48} /></View><AppText variant="meta" style={styles.eyebrow}>OUTDOOR TRAINING</AppText></View><AppText style={styles.headline}>A little further, today.</AppText><AppText style={styles.heroCopy}>GPS waits for a reliable signal before your timer begins.</AppText><Button label="Start a run" tone="accent" onPress={() => router.push('/run?mode=run' as Href)} accessibilityHint="Opens GPS setup for an outdoor run." /></View>
    <Card tone="soft">
      <AppText variant="meta">CHOOSE AN ACTIVITY</AppText>
      <AppText variant="section">Prefer a walk?</AppText>
      <Button label="Start a walk" tone="secondary" icon={<AnimatedIcon name="walk" size={24} />} onPress={() => router.push('/run?mode=walk' as Href)} accessibilityHint="Opens GPS setup for an outdoor walk." />
    </Card>
    <SectionHeader title="This week" detail={`${thisWeek.length} ACTIVITIES`} />
    <Card style={styles.weekCard} tone="moss">
      <View style={styles.weekTop}><View><AppText variant="meta">THIS WEEK</AppText><AppText variant="label">Saved activity</AppText></View><AnimatedIcon name="calendar" size={26} /></View>
      {history.status === 'loading' ? <AppText style={styles.activityCopy}>Loading saved activities…</AppText> : history.status === 'unavailable' ? <StateCard actionLabel="Try again" onAction={history.reload} title="Activity summary unavailable">Saved activity data could not be read. Your tracker is still available.</StateCard> : thisWeek.length === 0 ? <AppText style={styles.activityCopy}>Your week will take shape as you save runs and walks.</AppText> : <>
        <View style={styles.statsRow}><Metric value={String(runs.length)} label="RUNS" /><Metric value={String(walks.length)} label="WALKS" /><Metric value={durationLabel(activeTime)} label="ACTIVE TIME" /></View>
        {gpsItems.length > 0 && <AppText variant="meta">RECORDED GPS DISTANCE · {(gpsDistance / 1000).toFixed(2)} KM</AppText>}
      </>}
    </Card>
    {planAvailability.status === 'ready' && planAvailability.data && planAvailability.data.state !== 'active_approved' && <PlanNextStep availability={planAvailability.data} />}
    {planAvailability.status === 'unavailable' && <Card><AppText variant="meta">TRAINING PLAN</AppText><AppText style={styles.activityCopy}>Plan status could not be checked. Your GPS tracker is still available.</AppText><Button label="Try plan status again" tone="secondary" onPress={planAvailability.reload} /></Card>}
    <Button label="View your activities" tone="secondary" icon={<AnimatedIcon name="clock" size={24} />} onPress={() => router.push('/history' as Href)} accessibilityHint="Opens your saved activity history." />
  </Screen>;
}

function PlanNextStep({ availability }: { availability: NonNullable<ReturnType<typeof usePlanAvailability>['data']> }) {
  const status = consumerStatusForPlanAvailability(availability);
  const recovery = presentPlanAvailability(availability);
  return <Card tone="soft"><AppText variant="meta">YOUR TRAINING</AppText><AppText variant="section">{status.title}</AppText><AppText style={styles.activityCopy}>{status.message}</AppText><Button label={recovery.actionLabel ?? 'View plan'} tone="secondary" onPress={() => router.push((recovery.actionPath ?? '/plan') as Href)} /></Card>;
}

function Metric({ value, label }: { value: string; label: string }) { return <View style={styles.metric}><AppText variant="title">{value}</AppText><AppText variant="meta">{label}</AppText></View>; }

const styles = StyleSheet.create({ hero: { backgroundColor: colors.butterWash, borderRadius: 32, gap: spacing.md, minHeight: 320, overflow: 'hidden', padding: spacing.lg, position: 'relative' }, heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, heroIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 28, height: 58, justifyContent: 'center', width: 58 }, eyebrow: { color: colors.mossDark }, headline: { color: colors.ink, fontSize: 38, lineHeight: 42, fontWeight: '800', maxWidth: 280, letterSpacing: -1 }, heroCopy: { color: colors.mutedInk, fontSize: 15, lineHeight: 22, maxWidth: 290 }, weekCard: { gap: spacing.md }, weekTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' }, metric: { flex: 1, gap: spacing.xs, minWidth: 72 }, activityCopy: { color: colors.mutedInk } });
