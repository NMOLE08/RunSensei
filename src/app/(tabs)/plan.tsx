import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, PageHeader, Screen, SectionHeader } from '@/design/components';
import { addCalendarDays } from '@/domain/calendar/operations';
import { colors, spacing } from '@/design/tokens';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { assignmentsForWeek, dayStripDates, localDateOnly, sessionsForDate, weekProgressSummary } from '@/features/execution/viewModel';
import { SessionCard, StateCard } from '@/features/execution/components';
import { usePlanAvailability } from '@/features/execution/usePlanAvailability';
import { PlanAvailabilityCard } from '@/features/execution/PlanAvailabilityCard';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { Experimental5kPreviewCard } from '@/features/execution/Experimental5kPreviewCard';
import { useExperimentalHalfMarathonPreview } from '@/features/execution/useExperimentalHalfMarathonPreview';
import { ExperimentalHalfMarathonPreviewCard } from '@/features/execution/ExperimentalHalfMarathonPreviewCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { publishCurrentBeginner5kWeekOne } from '@/application/currentBeginner5kPublication';
import { planPreviewIdentityKey } from '@/application/planPreviewIdentity';
import { selectResearchPreview } from '@/features/execution/planResearchPreviewSelection';
import { initialPlanFocusRefreshState, nextPlanFocusRefresh, saveSelectedPreviewWeek, selectedPreviewWeek } from '@/features/execution/planPreviewRefreshLifecycle';
import { programmeSelectionIdentity } from '@/features/execution/researchPlanPresentation';

const asDate = (value: string) => value as `${number}-${number}-${number}`;

export default function PlanScreen() {
  const { user } = useAuth();
  return <AccountPlanScreen key={user?.id ?? 'signed-out'} />;
}
function AccountPlanScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selectedDate = date ?? localDateOnly();
  const { status, data, error, reload } = useActivePlan();
  const availability = usePlanAvailability();
  const previewContext = availability.data?.previewContext;
  const previewIdentity = previewContext ? planPreviewIdentityKey(previewContext) : 'loading';
  const experimentalHalfPreview = useExperimentalHalfMarathonPreview(experimental5kPreviewEnabled, previewContext ?? null);
  const reloadAvailability = availability.reload;
  const focusRefreshState = useRef(initialPlanFocusRefreshState);
  const [previewWeeks, setPreviewWeeks] = useState<Record<string, number>>({});
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const publicationInFlight = useRef(false);
  const selectPreviewWeek = useCallback((identity: string, maximumWeek: number, week: number) => {
    setPreviewWeeks((current) => saveSelectedPreviewWeek(current, identity, week, maximumWeek));
  }, []);
  useFocusEffect(useCallback(() => {
    const decision = nextPlanFocusRefresh(focusRefreshState.current);
    focusRefreshState.current = decision.state;
    if (decision.refreshActivePlan || decision.refreshAvailability) {
      void Promise.all([decision.refreshActivePlan ? reload() : Promise.resolve(), decision.refreshAvailability ? reloadAvailability() : Promise.resolve()]);
    }
  }, [reload, reloadAvailability]));

  const publishWeekOne = useCallback(async () => {
    if (publicationInFlight.current) return;
    publicationInFlight.current = true;
    setPublishing(true);
    setPublicationError(null);
    try {
      const result = await publishCurrentBeginner5kWeekOne();
      if (result.status.code !== 'plan_ready') throw new Error(result.status.message);
      await Promise.all([reload(), reloadAvailability()]);
    } catch (publishError) {
      setPublicationError(publishError instanceof Error ? publishError.message : 'The plan could not be activated. Please try again.');
      await Promise.all([reload(), reloadAvailability()]);
    } finally {
      publicationInFlight.current = false;
      setPublishing(false);
    }
  }, [reload, reloadAvailability]);

  if (availability.status === 'loading') return <Screen><AppText variant="meta">YOUR PLAN</AppText><StateCard title="Checking plan availability">Reviewing this account’s saved profile and plan status.</StateCard></Screen>;
  if (availability.status === 'unavailable') return <Screen><AppText variant="meta">YOUR PLAN</AppText><StateCard actionLabel="Try again" onAction={availability.reload} title="Plan status unavailable">{availability.error ?? 'Your plan availability could not be read while offline.'}</StateCard></Screen>;
  if (availability.data && availability.data.state !== 'active_approved') {
    const goal = availability.data.previewContext.goal;
    const publication = availability.data.beginner5kPublication;
    if (experimental5kPreviewEnabled && goal === '5k' && publication?.preview) {
      const preview = publication.preview;
      const programmeIdentity = programmeSelectionIdentity(previewIdentity, { kind: 'beginner_5k', policyReference: `${preview.pathway.id}@${preview.pathway.version}`, id: `${preview.scheduleAnchor}:${preview.sessions[0]?.date ?? ''}:${preview.sessions.at(-1)?.date ?? ''}` });
      return <Screen><Experimental5kPreviewCard value={preview} selectedWeek={selectedPreviewWeek(previewWeeks, programmeIdentity, 12)} onSelectedWeekChange={(week) => selectPreviewWeek(programmeIdentity, 12, week)} onRegenerate={availability.reload} activationStatus={publication.status} canPublish={publication.canPublish} onPublish={publishWeekOne} publishing={publishing} publicationError={publicationError} /></Screen>;
    }
    const researchPreview = selectResearchPreview(experimental5kPreviewEnabled, goal, previewIdentity, experimentalHalfPreview);
    if (researchPreview.kind === 'preview') {
      const preview = researchPreview.value;
      const programmeIdentity = programmeSelectionIdentity(previewIdentity, preview.kind === 'foundation_program'
        ? { kind: 'foundation', policyReference: preview.policyReference, id: `${preview.workouts[0]?.date ?? ''}:${preview.workouts.at(-1)?.date ?? ''}` }
        : preview.kind === 'simulation'
          ? { kind: 'half_marathon', policyReference: `${preview.policy.id}@${preview.policy.version}`, id: `${preview.weeks[0]?.workouts[0]?.date ?? ''}:${preview.weeks.at(-1)?.workouts.at(-1)?.date ?? ''}` }
          : { kind: 'foundation', policyReference: 'blocked', id: preview.reasonCodes.join(':') });
      const maximumWeek = preview.kind === 'foundation_program' ? preview.weeks.length : preview.kind === 'simulation' ? preview.weeks.length : 1;
      return <Screen>{researchPreview.foundation && preview.kind === 'foundation_program' && <Button label="Saved research blocks" tone="secondary" onPress={() => router.push('/research-foundation' as Href)} />}<ExperimentalHalfMarathonPreviewCard value={preview} selectedWeek={selectedPreviewWeek(previewWeeks, programmeIdentity, maximumWeek)} onSelectedWeekChange={(week, max) => selectPreviewWeek(programmeIdentity, max, week)} foundation={researchPreview.foundation} onRegenerate={experimentalHalfPreview.reload} /></Screen>;
    }
    if (researchPreview.kind === 'loading') return <Screen><AppText variant="meta">YOUR PLAN</AppText><AppText variant="title">Training plan</AppText><StateCard title="Checking research preview">Comparing saved information with the bundled draft pathways. This cannot activate a plan.</StateCard></Screen>;
    if (researchPreview.kind === 'error') return <Screen><AppText variant="meta">YOUR PLAN</AppText><AppText variant="title">Training plan</AppText><StateCard actionLabel="Try again" onAction={experimentalHalfPreview.reload} title="Research preview unavailable">{researchPreview.message}</StateCard></Screen>;
    if (experimental5kPreviewEnabled && goal === '5k' && !publication?.preview && publication) return <Screen><AppText variant="meta">YOUR PLAN</AppText><AppText variant="title">Training plan</AppText><PlanAvailabilityCard value={availability.data} /><StateCard actionLabel="Try again" onAction={availability.reload} title="Research preview unavailable">{publication.status.message}</StateCard></Screen>;
    return <Screen><AppText variant="meta">YOUR PLAN</AppText><AppText variant="title">Training plan</AppText><PlanAvailabilityCard value={availability.data} /></Screen>;
  }
  if (status === 'loading') return <Screen><AppText variant="meta">YOUR PLAN</AppText><StateCard title="Opening your calendar">Your saved training week is loading.</StateCard></Screen>;
  if (status === 'unavailable') return <Screen><AppText variant="meta">YOUR PLAN</AppText><StateCard actionLabel="Try again" onAction={reload} title="Calendar unavailable">{error ?? 'Your saved training week could not be read. No workout is shown until it is available.'}</StateCard></Screen>;
  if (!data) return <Screen><AppText variant="meta">YOUR PLAN</AppText><AppText variant="title">Training calendar</AppText><StateCard title="No active plan yet">Your calendar will appear here after an eligible plan is created and activated.</StateCard></Screen>;
  if (data.snapshot.plan.recommendationState !== 'active') return <Screen><AppText variant="meta">YOUR PLAN</AppText><StateCard actionLabel="Review plan" onAction={() => router.push('/plan-review' as Href)} title={data.snapshot.plan.recommendationState === 'health_hold' ? 'Training is paused' : 'Plan needs review'}>{data.snapshot.plan.recommendationState === 'health_hold' ? 'A reported concern keeps future workout recommendations paused.' : 'Review the saved activity and validate the remaining schedule before training continues.'}</StateCard></Screen>;

  const days = dayStripDates(selectedDate);
  const week = assignmentsForWeek(data.snapshot.assignments, selectedDate);
  const weekStart = days[0]?.date ?? selectedDate;
  const weekEnd = days[6]?.date ?? selectedDate;
  const weekHeading = `${new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${new Date(`${weekEnd}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
  const progress = weekProgressSummary(data.snapshot.assignments, data.resolutions, selectedDate, localDateOnly());
  const selectDate = (next: string) => router.replace(`/plan?date=${next}` as Href);

  return <Screen>
    <PageHeader eyebrow="YOUR PLAN" title="Training plan" description="Your week at a glance." action={<View style={styles.progressBadge}><AppText style={styles.weekCount}>{week.length ? `${progress.completed}/${progress.scheduled}` : '—'}</AppText><AppText variant="meta">DONE</AppText></View>} />
    <Card style={styles.planOverview}><View style={styles.overviewTop}><View><AppText variant="meta">CURRENT SCHEDULE</AppText><AppText variant="section">{week.length ? `${week.length} workouts this week` : 'No workouts this week'}</AppText></View><AppText variant="meta">{progress.completed ? `${progress.completed} COMPLETED` : 'STARTING OUT'}</AppText></View><AppText style={styles.overviewCopy}>{progress.partial ? `${progress.partial} partially completed session${progress.partial === 1 ? '' : 's'} recorded.` : progress.unreported ? 'A past session has not been reported yet.' : 'Choose a workout below to see its complete steps.'}</AppText></Card>

    <Card style={styles.weekCard}>
      <View style={styles.weekTop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8} onPress={() => selectDate(addCalendarDays(asDate(selectedDate), -7))} style={styles.weekArrow}><AppText variant="title">‹</AppText></Pressable>
        <AppText variant="label" accessibilityLiveRegion="polite">{weekHeading}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Next week" hitSlop={8} onPress={() => selectDate(addCalendarDays(asDate(selectedDate), 7))} style={styles.weekArrow}><AppText variant="title">›</AppText></Pressable>
      </View>
      <View style={styles.dayStrip} accessibilityLabel="Seven day training calendar">
        {days.map(({ day, date: dayDate }) => {
          const entries = sessionsForDate(data.snapshot.assignments, data.resolutions, dayDate, localDateOnly());
          const isSelected = selectedDate === dayDate;
          const hasWorkout = entries.length > 0;
          const done = entries.some((entry) => entry.state === 'completed');
          return <Pressable key={dayDate} accessibilityRole="button" accessibilityLabel={`${day} ${dayDate}${hasWorkout ? `, ${entries.length} workout${entries.length === 1 ? '' : 's'}` : ', rest day'}${done ? ', completed' : ''}${isSelected ? ', selected' : ''}`} accessibilityState={{ selected: isSelected }} onPress={() => selectDate(dayDate)} style={({ pressed }) => [styles.day, isSelected && styles.daySelected, pressed && styles.pressed]}>
            <AppText variant="meta" style={isSelected && styles.selectedText}>{day}</AppText>
            <AppText variant="label" style={isSelected && styles.selectedText}>{dayDate.slice(-2)}</AppText>
            <View style={[styles.dayMark, hasWorkout && styles.workoutMark, done && styles.doneMark, isSelected && !hasWorkout && styles.selectedRestMark]} />
          </Pressable>;
        })}
      </View>
      <View style={styles.legend}><View style={styles.legendItem}><View style={styles.workoutMark} /><AppText variant="meta">WORKOUT</AppText></View><View style={styles.legendItem}><View style={styles.dayMark} /><AppText variant="meta">REST</AppText></View><View style={styles.legendItem}><View style={styles.doneMark} /><AppText variant="meta">COMPLETED</AppText></View></View>
    </Card>

    {week.length === 0 && <StateCard title="No scheduled workouts this week">There are no assignments in this calendar week.</StateCard>}
    <SectionHeader title="This week" detail={`${week.length} SCHEDULED`} />
    {days.map(({ day, date: dayDate }) => {
      const sessions = sessionsForDate(data.snapshot.assignments, data.resolutions, dayDate, localDateOnly());
      const dateLabel = new Date(`${dayDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return <View key={dayDate} style={styles.daySection}>
        <View style={styles.dayHeading}><AppText variant="label">{day}</AppText><AppText variant="meta">{dateLabel}</AppText></View>
        {sessions.length > 0 ? sessions.map((session) => <View key={session.assignment.id} style={styles.sessionGroup}><SessionCard session={session} units={data.units} showMenu /></View>) : <View style={styles.restRow}><View style={styles.restLine} /><AppText variant="meta">RECOVERY DAY</AppText><View style={styles.restLine} /></View>}
      </View>;
    })}
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressBadge: { alignItems: 'center', backgroundColor: colors.butterWash, borderRadius: 18, minWidth: 72, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  weekCount: { color: colors.periwinkle, fontFamily: 'PixelifySans', fontSize: 36, lineHeight: 42 },
  subheading: { color: colors.mutedInk, marginTop: -spacing.md },
  planOverview: { backgroundColor: colors.mossWash, gap: spacing.xs, padding: spacing.md }, overviewTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }, overviewCopy: { color: colors.mossDark, fontSize: 14, lineHeight: 20 },
  weekCard: { padding: spacing.md },
  weekTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  weekArrow: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  dayStrip: { flexDirection: 'row', gap: 3, justifyContent: 'space-between' },
  day: { alignItems: 'center', borderColor: colors.divider, borderRadius: 12, borderWidth: 1, flex: 1, gap: 4, justifyContent: 'center', minHeight: 64, paddingVertical: spacing.xs },
  daySelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  selectedText: { color: colors.onInk },
  dayMark: { backgroundColor: colors.divider, borderRadius: 4, height: 6, width: 6 },
  workoutMark: { backgroundColor: colors.coral, borderRadius: 4, height: 7, width: 7 },
  doneMark: { backgroundColor: colors.success, borderRadius: 4, height: 7, width: 7 },
  selectedRestMark: { backgroundColor: colors.onInk },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  daySection: { gap: spacing.xs },
  sessionGroup: { gap: spacing.xs },
  dayHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.sm },
  restRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 38 }, restLine: { backgroundColor: colors.divider, flex: 1, height: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.75 },
});
