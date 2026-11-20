import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { AppText, Button, Card, Screen } from '@/design/components';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { activeSeconds } from '@/domain/tracking/session';
import { liveRunMetrics } from '@/application/liveRunMetrics';
import { discardTracker, finishTracker, pauseTracker, pendingWorkout, recoverTracker, resumeTracker, startTracker, subscribeTracker, type TrackerSnapshot } from '@/application/workoutTracker';
import { decodePrescription, formatTarget } from '@/domain/training/prescription';
import { localDateOnly } from '@/features/execution/viewModel';
import { colors } from '@/design/tokens';
import { type TrackerUiOperation } from '@/domain/tracking/controls';
import { LiveWorkoutControls, LiveWorkoutDashboard } from '@/features/execution/LiveWorkoutDashboard';
import { LiveWorkoutScreen } from '@/features/execution/LiveWorkoutScreen';

export default function TrainingScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>(); const { data, status } = useActivePlan();
  const [mode, setMode] = useState<'run' | 'walk'>('run'); const [tracker, setTracker] = useState<TrackerSnapshot | null>(null); const [now, setNow] = useState(() => Date.now()); const [error, setError] = useState<string | null>(null); const [workingAction, setWorkingAction] = useState<TrackerUiOperation>(null); const working = workingAction !== null;
  const operationInFlight = useRef(false);
  useEffect(() => { const unsubscribe = subscribeTracker(setTracker); void recoverTracker().catch(() => setError('Could not recover the saved workout.')); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { unsubscribe(); clearInterval(timer); }; }, []);
  const assignment = data?.snapshot.assignments.find((item) => item.id === sessionId || item.logicalSessionId === sessionId);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof pendingWorkout>>>(null);
  useEffect(() => { if (assignment) void pendingWorkout(assignment.logicalSessionId).then(setPending).catch(() => setError('Could not check for unfinished feedback.')); }, [assignment]);
  const run = async (action: () => Promise<void>, phase: Exclude<TrackerUiOperation, null>) => { if (operationInFlight.current) return; operationInFlight.current = true; setWorkingAction(phase); setError(null); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update the workout.'); } finally { operationInFlight.current = false; setWorkingAction(null); } };
  const start = (timerOnly: boolean) => run(async () => { if (!assignment || !data) throw new Error('The scheduled workout is unavailable.'); await startTracker({ sessionId: assignment.logicalSessionId, revisionId: data.snapshot.revision.id, prescription: assignment.prescriptionJson, mode, timerOnly }); }, 'starting');
  const finish = () => run(async () => { if (!tracker) return; const completed = await finishTracker(); const duration = activeSeconds(completed.session.segments, completed.session.endedAtMs ?? Date.now()); router.replace({ pathname: '/log/[sessionId]', params: { sessionId: completed.session.plannedSessionId ?? sessionId, trackedId: completed.session.id, trackedSeconds: String(Math.round(duration)), trackedMeters: completed.session.distanceMeters === null ? '' : String(Math.round(completed.session.distanceMeters)), trackedDate: localDateOnly(new Date(completed.session.startedAtMs ?? Date.now())), trackedMode: completed.session.mode, trackedSource: completed.timerOnly ? 'timer_only' : 'gps' } } as unknown as Href); }, 'finishing');
  const confirmDiscard = () => Alert.alert('Discard workout?', 'The recorded workout will not be added to your training history.', [{ text: 'Keep workout', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void run(discardTracker, 'discarding'); } }]);
  if (status === 'loading') return <Screen><AppText>Opening workout…</AppText></Screen>;
  if (!assignment || !data) return <Screen><AppText>Workout unavailable. Return to your plan and try again.</AppText><Button label="Back" onPress={() => router.back()} /></Screen>;
  const prescription = decodePrescription(assignment.prescriptionJson); const target = prescription ? formatTarget(prescription, data.units) : null;
  const metrics = tracker ? liveRunMetrics(tracker, now) : null;
  const differentSession = tracker && tracker.session.plannedSessionId !== assignment.logicalSessionId;
  if (tracker && metrics) return <LiveWorkoutScreen controls={<LiveWorkoutControls metrics={metrics} operation={workingAction} onPause={() => { void run(pauseTracker, 'pausing'); }} onResume={() => { void run(resumeTracker, 'resuming'); }} onFinish={() => { void finish(); }} />}><LiveWorkoutDashboard metrics={metrics} timerOnly={tracker.timerOnly} operation={workingAction} showControls={false} />{tracker.message && <AppText accessibilityLiveRegion="polite" style={styles.liveMessage}>{tracker.message}</AppText>}{differentSession && <AppText style={styles.liveMessage}>This is an unfinished workout from another day.</AppText>}<Button disabled={working} label="Discard workout" tone="secondary" onPress={confirmDiscard} />{tracker.session.status === 'interrupted' && <AppText style={styles.liveMessage}>Recording was interrupted. It has not resumed automatically.</AppText>}{error && <AppText accessibilityLiveRegion="polite" style={styles.error}>{error}</AppText>}</LiveWorkoutScreen>;
  return <Screen><AppText variant="meta">WORKOUT / {assignment.plannedDate}</AppText><AppText variant="title">{tracker ? (tracker.session.mode === 'run' ? 'Run' : 'Walk') : 'Ready to move?'}</AppText>
    <Card><AppText variant="meta">YOUR PLANNED WORKOUT</AppText><AppText>{target ?? 'See workout details'} · {prescription?.purpose}</AppText><AppText>{prescription?.effortCue}</AppText></Card>
  {!tracker ? <>{pending && <Card><AppText>A previous workout is waiting for feedback.</AppText><Button label="Continue feedback" onPress={() => { const segments = JSON.parse(pending.segments_json) as { startedAtMs: number; endedAtMs: number | null }[]; router.push({ pathname: '/log/[sessionId]', params: { sessionId: pending.planned_session_id, trackedId: pending.id, trackedSeconds: String(Math.round(activeSeconds(segments, pending.checkpoint_at_ms))), trackedMeters: pending.distance_meters === null ? '' : String(Math.round(pending.distance_meters)), trackedDate: localDateOnly(new Date(pending.started_at_ms)), trackedMode: pending.mode, trackedSource: pending.status_reason === 'timer_only' ? 'timer_only' : 'gps' } } as unknown as Href); }} /></Card>}<AppText>Choose your activity</AppText><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button label={mode === 'run' ? '✓ Run' : 'Run'} tone={mode === 'run' ? 'primary' : 'secondary'} onPress={() => setMode('run')} /></View><View style={{ flex: 1 }}><Button label={mode === 'walk' ? '✓ Walk' : 'Walk'} tone={mode === 'walk' ? 'primary' : 'secondary'} onPress={() => setMode('walk')} /></View></View><AppText>Location is used only during your workout. Keep the app open while recording.</AppText><Button disabled={working} label={working ? 'Starting…' : 'Start workout with GPS'} onPress={() => { void start(false); }} /><Button disabled={working} label="Start timer only" tone="secondary" onPress={() => { void start(true); }} /></> : null}
    {error && <AppText accessibilityLiveRegion="polite" style={{ color: colors.error }}>{error}</AppText>}</Screen>;
}

const styles = { error: { color: colors.error }, liveMessage: { color: '#D4DDD0' } } as const;
