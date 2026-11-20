import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { discardTracker, finishTracker, pauseTracker, recoverTracker, resumeTracker, startTracker, subscribeTracker, type TrackerSnapshot } from '@/application/workoutTracker';
import { AppText, Button, Card, PageHeader, Screen } from '@/design/components';
import { researchWorkoutReturnRoute } from '@/application/researchWorkoutFlow';
import { colors, spacing } from '@/design/tokens';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { liveRunMetrics } from '@/application/liveRunMetrics';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { type TrackerUiOperation } from '@/domain/tracking/controls';
import { LiveWorkoutControls, LiveWorkoutDashboard } from '@/features/execution/LiveWorkoutDashboard';
import { LiveWorkoutScreen } from '@/features/execution/LiveWorkoutScreen';

export default function RunScreen() {
  const params = useLocalSearchParams<{ mode?: string; researchBlockId?: string; assignmentId?: string }>();
  const [mode, setMode] = useState<'run' | 'walk'>(params.mode === 'walk' ? 'walk' : 'run');
  const [tracker, setTracker] = useState<TrackerSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<TrackerUiOperation>(null);
  const working = workingAction !== null;
  const operation = useRef(false);
  useEffect(() => { const unsubscribe = subscribeTracker(setTracker); void recoverTracker().catch(() => setError('The saved recording could not be recovered.')); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { unsubscribe(); clearInterval(timer); }; }, []);
  const run = async (action: () => Promise<void>, phase: Exclude<TrackerUiOperation, null>) => { if (operation.current) return; operation.current = true; setWorkingAction(phase); setError(null); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The recording could not be updated.'); } finally { operation.current = false; setWorkingAction(null); } };
  const start = () => run(() => startTracker({ mode, timerOnly: false, ...(experimental5kPreviewEnabled && params.researchBlockId && params.assignmentId ? { researchCheckIn: { blockId: params.researchBlockId, assignmentId: params.assignmentId } } : {}) }), 'starting');
  const finish = () => run(async () => {
    const saved = await finishTracker();
    router.replace(researchWorkoutReturnRoute({ blockId: params.researchBlockId, assignmentId: params.assignmentId, trackingSessionId: saved.session.id }) as Href);
  }, 'finishing');
  const discard = () => Alert.alert('Discard this recording?', 'The run will not appear in local History.', [{ text: 'Keep recording', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void run(async () => { await discardTracker(); router.replace('/'); }, 'discarding'); } }]);
  const metrics = tracker ? liveRunMetrics(tracker, now) : null;
  if (tracker && metrics) return <LiveWorkoutScreen controls={<LiveWorkoutControls metrics={metrics} operation={workingAction} onPause={() => { void run(pauseTracker, 'pausing'); }} onResume={() => { void run(resumeTracker, 'resuming'); }} onFinish={() => { void finish(); }} />}><LiveWorkoutDashboard metrics={metrics} timerOnly={tracker.timerOnly} operation={workingAction} showControls={false} />{tracker.message && <AppText accessibilityLiveRegion="polite" style={styles.liveMessage}>{tracker.message}</AppText>}<Button disabled={working} label="Discard recording" tone="secondary" onPress={discard} />{error && <AppText accessibilityLiveRegion="polite" style={styles.error}>{error}</AppText>}</LiveWorkoutScreen>;
  return <Screen>
    <PageHeader eyebrow="OUTDOOR · GPS REQUIRED" title={tracker ? (tracker.session.mode === 'run' ? 'Outdoor run' : 'Outdoor walk') : 'Set up your activity'} description={tracker ? 'Live metrics use active recording time.' : 'Choose your activity, then move outside for a reliable signal.'} />
    {!tracker ? <>
      <Card tone="butter"><AnimatedIcon name="location" size={54} active={working} /><AppText variant="section">Find your signal</AppText><AppText>The timer begins only after GPS is ready.</AppText></Card>
      <View style={styles.row}><View style={styles.flex}><Button label={mode === 'run' ? '✓ Run' : 'Run'} tone={mode === 'run' ? 'primary' : 'secondary'} onPress={() => setMode('run')} /></View><View style={styles.flex}><Button label={mode === 'walk' ? '✓ Walk' : 'Walk'} tone={mode === 'walk' ? 'primary' : 'secondary'} onPress={() => setMode('walk')} /></View></View>
      <Button disabled={working} label={working ? 'Acquiring GPS…' : `Find GPS and start ${mode}`} onPress={start} />
      <Button label="Back" tone="secondary" onPress={() => router.back()} />
    </> : null}
    {error && <AppText accessibilityLiveRegion="polite" style={styles.error}>{error}</AppText>}
  </Screen>;
}

const styles = StyleSheet.create({ error: { color: colors.error }, flex: { flex: 1 }, liveMessage: { color: '#D4DDD0' }, row: { flexDirection: 'row', gap: spacing.sm } });
