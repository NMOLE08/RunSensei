import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { discardTracker, finishTracker, pauseTracker, recoverTracker, resumeTracker, startTracker, subscribeTracker, type TrackerSnapshot } from '@/application/workoutTracker';
import { AppText, Button, Card, Screen } from '@/design/components';
import { spacing } from '@/design/tokens';
import { averagePaceSecondsPerKm, livePaceSecondsPerKm } from '@/domain/tracking/metrics';
import { activeSeconds } from '@/domain/tracking/session';

function clock(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; }
function pace(seconds: number | null) { return seconds === null ? '—' : clock(seconds); }

export default function RunScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'run' | 'walk'>(params.mode === 'walk' ? 'walk' : 'run');
  const [tracker, setTracker] = useState<TrackerSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const operation = useRef(false);
  useEffect(() => { const unsubscribe = subscribeTracker(setTracker); void recoverTracker().catch(() => setError('The saved recording could not be recovered.')); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { unsubscribe(); clearInterval(timer); }; }, []);
  const run = async (action: () => Promise<void>) => { if (operation.current) return; operation.current = true; setWorking(true); setError(null); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The recording could not be updated.'); } finally { operation.current = false; setWorking(false); } };
  const start = () => run(() => startTracker({ mode, timerOnly: false }));
  const finish = () => run(async () => { await finishTracker(); router.replace('/history'); });
  const discard = () => Alert.alert('Discard this recording?', 'The run will not appear in local History.', [{ text: 'Keep recording', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void run(async () => { await discardTracker(); router.replace('/'); }); } }]);
  const seconds = tracker ? activeSeconds(tracker.session.segments, now) : 0;
  const distance = tracker?.session.distanceMeters ?? null;
  const currentPace = tracker ? livePaceSecondsPerKm(tracker.track) : null;
  const averagePace = averagePaceSecondsPerKm(distance, seconds);
  return <Screen>
    <AppText variant="meta">OUTDOOR / GPS REQUIRED</AppText>
    <AppText variant="title">{tracker ? (tracker.session.mode === 'run' ? 'Outdoor run' : 'Outdoor walk') : 'Set up your activity'}</AppText>
    {!tracker ? <>
      <Card><AppText>The app will request location access and wait for a usable GPS fix. Your time does not start while GPS is being acquired.</AppText></Card>
      <View style={styles.row}><View style={styles.flex}><Button label={mode === 'run' ? '✓ Run' : 'Run'} tone={mode === 'run' ? 'primary' : 'secondary'} onPress={() => setMode('run')} /></View><View style={styles.flex}><Button label={mode === 'walk' ? '✓ Walk' : 'Walk'} tone={mode === 'walk' ? 'primary' : 'secondary'} onPress={() => setMode('walk')} /></View></View>
      <Button label={working ? 'Acquiring GPS…' : `Find GPS and start ${mode}`} onPress={working ? undefined : start} />
      <Button label="Back" tone="secondary" onPress={() => router.back()} />
    </> : <>
      <Card>
        <AppText variant="meta">{tracker.session.status.toUpperCase()} / GPS</AppText>
        <AppText accessibilityLabel={`Active time ${clock(seconds)}`} variant="display">{clock(seconds)}</AppText><AppText>Active time</AppText>
        <View style={styles.metrics}><View><AppText variant="title">{distance === null ? '—' : (distance / 1000).toFixed(2)}</AppText><AppText>Distance (km)</AppText></View><View><AppText variant="title">{pace(averagePace)}</AppText><AppText>Average /km</AppText></View><View><AppText variant="title">{pace(currentPace)}</AppText><AppText>Current /km</AppText></View></View>
        <AppText accessibilityLiveRegion="polite">{tracker.message ?? 'GPS recording is active.'}</AppText>
      </Card>
      {tracker.session.status === 'recording' && <Button label="Pause" tone="secondary" onPress={working ? undefined : () => { void run(pauseTracker); }} />}
      {tracker.session.status === 'paused' && <Button label="Resume" onPress={working ? undefined : () => { void run(resumeTracker); }} />}
      <Button label={working ? 'Saving…' : 'Finish and save'} onPress={working ? undefined : finish} />
      <Button label="Discard" tone="secondary" onPress={working ? undefined : discard} />
    </>}
    {error && <AppText accessibilityLiveRegion="polite" style={styles.error}>{error}</AppText>}
  </Screen>;
}

const styles = StyleSheet.create({ error: { color: '#A33' }, flex: { flex: 1 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, row: { flexDirection: 'row', gap: spacing.sm } });
