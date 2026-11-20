import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { AppText, Button, Card, PageHeader, ProgressBar, Screen } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { completeGuidedUntimedPhase, finishGuidedWorkout, loadGuidedWorkoutExecution, pauseGuidedWorkout, reconcileGuidedWorkoutExecution, resumeGuidedWorkout, startGuidedWorkout, type GuidedExecutionSnapshot } from '@/application/guidedWorkoutExecution';
import { getGuidedCuePreferences, saveGuidedCuePreferences } from '@/application/guidedCueSettings';
import { guidedVoiceAvailability } from '@/application/guidedWorkoutCues';
import type { GuidedCuePreferences } from '@/data/guidedCuePreferencesRepository';
import { isCountdownCrossing } from '@/domain/tracking/workoutCueEvents';
import { guidedPhaseView } from '@/domain/tracking/guidedWorkout';
import { subscribeTracker } from '@/application/workoutTracker';
import { researchWorkoutReturnRoute } from '@/application/researchWorkoutFlow';
import { liveRunMetrics } from '@/application/liveRunMetrics';
import { LiveWorkoutControls, LiveWorkoutDashboard } from './LiveWorkoutDashboard';
import { LiveWorkoutScreen } from './LiveWorkoutScreen';

const clock = (value: number) => `${Math.floor(Math.max(0, value) / 60).toString().padStart(2, '0')}:${(Math.floor(Math.max(0, value)) % 60).toString().padStart(2, '0')}`;
const targetText = (phase: NonNullable<ReturnType<typeof guidedPhaseView>['current']>) => phase.target.kind === 'duration_seconds' ? clock(phase.target.value) : phase.target.kind === 'distance_meters' ? `${phase.target.value} m · duration not prescribed` : 'Duration and distance not prescribed';

export function GuidedFoundationWorkoutScreen() {
  const { user } = useAuth();
  return <GuidedFoundationWorkoutAccount key={user?.id ?? 'signed-out'} user={user} />;
}

function GuidedFoundationWorkoutAccount({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const params = useLocalSearchParams<{ blockId?: string | string[]; assignmentId?: string | string[] }>();
  const blockId = Array.isArray(params.blockId) ? params.blockId[0] : params.blockId;
  const assignmentId = Array.isArray(params.assignmentId) ? params.assignmentId[0] : params.assignmentId;
  const [value, setValue] = useState<GuidedExecutionSnapshot | null>(null); const [now, setNow] = useState(() => Date.now()); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [pendingAction, setPendingAction] = useState<'starting' | 'pausing' | 'resuming' | 'completing' | 'finishing' | null>(null);
  const [cuePreferences, setCuePreferences] = useState<GuidedCuePreferences | null>(null); const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const lock = useRef(false); const lastPersistedPhase = useRef(-1);
  const countdownPrevious = useRef<{ phaseIndex: number; remaining: number } | null>(null);
  const refresh = useCallback(async () => { if (!user || !blockId || !assignmentId) throw new Error('This guided workout link is incomplete.'); const next = await loadGuidedWorkoutExecution(user.id, blockId, assignmentId); setValue(next); lastPersistedPhase.current = next.progress.phaseIndex; }, [user, blockId, assignmentId]);
  useEffect(() => { if (!experimental5kPreviewEnabled || !user) return; const reload = (message: string) => { void Promise.resolve().then(refresh).catch(e => setError(e instanceof Error ? e.message : message)); }; reload('The saved workout could not be opened.'); void getGuidedCuePreferences(user.id).then(setCuePreferences).catch(() => setCuePreferences({ voiceEnabled: false, muted: false, countdownEnabled: false })); void guidedVoiceAvailability().then(result => setSpeechAvailable(result.available)).catch(() => setSpeechAvailable(false)); const tick = setInterval(() => setNow(Date.now()), 1000); const unsubscribe = subscribeTracker(() => reload('Workout state could not be refreshed.')); const state = AppState.addEventListener('change', next => { countdownPrevious.current = null; if (next === 'active') reload('Workout state could not be refreshed.'); }); return () => { clearInterval(tick); unsubscribe(); state.remove(); }; }, [refresh, user]);
  const baseMetrics = useMemo(() => value?.tracker ? liveRunMetrics(value.tracker, now) : null, [value, now]);
  const active = (baseMetrics?.activeElapsedMs ?? 0) / 1000;
  const view = useMemo(() => value ? guidedPhaseView(value.progress, value.workout.phases, active) : null, [value, active]);
  const metrics = useMemo(() => value?.tracker ? liveRunMetrics(value.tracker, now, view) : null, [value, now, view]);
  useEffect(() => {
    if (!user || !blockId || !assignmentId || !view || !cuePreferences?.voiceEnabled || cuePreferences.muted || !cuePreferences.countdownEnabled || view.remainingSeconds === null || value?.progress.status !== 'running') { countdownPrevious.current = null; return; }
    const previous = countdownPrevious.current;
    if (previous?.phaseIndex === value.progress.phaseIndex && isCountdownCrossing(previous.remaining, view.remainingSeconds, 10)) {
      void import('@/application/guidedWorkoutExecution').then(({ maybeEmitGuidedCountdown }) => maybeEmitGuidedCountdown(user.id, blockId, assignmentId, true, 10));
    }
    countdownPrevious.current = { phaseIndex: value.progress.phaseIndex, remaining: view.remainingSeconds };
  }, [user, blockId, assignmentId, value, view, cuePreferences]);
  useEffect(() => { if (!value || !view || !value.tracker || value.tracker.session.status !== 'recording' || view.progress.phaseIndex === lastPersistedPhase.current) return; lastPersistedPhase.current = view.progress.phaseIndex; void reconcileGuidedWorkoutExecution(value.tracker.session.ownerId, value.workout.blockId, value.workout.assignment.assignmentId).then(setValue).catch(e => setError(e instanceof Error ? e.message : 'Phase progress could not be saved.')); }, [value, view]);
  const run = async (action: () => Promise<GuidedExecutionSnapshot>, phase: 'starting' | 'pausing' | 'resuming' | 'completing') => { if (lock.current) return; lock.current = true; setBusy(true); setPendingAction(phase); setError(null); try { const next = await action(); setValue(next); lastPersistedPhase.current = next.progress.phaseIndex; } catch (e) { setError(e instanceof Error ? e.message : 'The guided workout could not be updated.'); } finally { lock.current = false; setBusy(false); setPendingAction(null); } };
  const updateCuePreference = async (key: keyof GuidedCuePreferences) => { if (!user || !cuePreferences || lock.current) return; lock.current = true; setBusy(true); setError(null); try { const next = { ...cuePreferences, [key]: !cuePreferences[key] }; setCuePreferences(await saveGuidedCuePreferences(user.id, next, value?.tracker?.session.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Voice guidance settings could not be saved.'); } finally { lock.current = false; setBusy(false); } };
  if (!experimental5kPreviewEnabled || !user) return <Screen><AppText>Guided research workouts are unavailable.</AppText></Screen>;
  if (error && !value) return <Screen><PageHeader title="Workout unavailable" /><Card tone="coral"><AppText accessibilityRole="alert">{error}</AppText><Button label="Back to Plan" onPress={() => router.back()} /></Card></Screen>;
  if (!value || !view) return <Screen><AppText>Opening saved workout…</AppText></Screen>;
  const phase = view.current; const trackerStatus = value.tracker?.session.status;
  const status = value.progress.status === 'interrupted' || trackerStatus === 'interrupted' ? 'Interrupted — review required' : value.progress.status === 'finished' ? 'Finished' : pendingAction ? pendingAction === 'starting' ? 'Starting GPS' : pendingAction === 'pausing' ? 'Pausing' : pendingAction === 'resuming' ? 'Resuming' : pendingAction === 'completing' ? 'Updating phase' : 'Finishing' : trackerStatus === 'paused' || value.progress.status === 'paused' ? 'Paused' : trackerStatus === 'recording' ? 'Running' : 'Ready';
  const finish = async () => { if (!user || !blockId || !assignmentId || lock.current) return; lock.current = true; setBusy(true); setPendingAction('finishing'); setError(null); try { const result = await finishGuidedWorkout(user.id, blockId, assignmentId); if (!result.tracker) throw new Error('The saved GPS session could not be reopened.'); router.replace(researchWorkoutReturnRoute({ blockId, assignmentId, trackingSessionId: result.tracker.session.id }) as Href); } catch (e) { setError(e instanceof Error ? e.message : 'The workout could not be saved.'); } finally { lock.current = false; setBusy(false); setPendingAction(null); } };
  const dashboardPhase = phase ? { title: phase.kind === 'run' ? 'Running' : phase.kind === 'recovery' || phase.kind === 'walk' ? 'Walking / recovery' : phase.kind, target: targetText(phase), detail: phase.instruction, purpose: phase.purpose || null, repetition: phase.repetition > 1 ? `Round ${phase.repetition}` : null, remaining: view.remainingSeconds === null ? null : clock(view.remainingSeconds), next: view.next ? view.next.instruction : null } : null;
  if (metrics && value.tracker) return <LiveWorkoutScreen controls={<LiveWorkoutControls metrics={metrics} operation={pendingAction} onPause={() => user && blockId && assignmentId ? void run(() => pauseGuidedWorkout(user.id, blockId, assignmentId), 'pausing') : undefined} onResume={() => user && blockId && assignmentId ? void run(() => resumeGuidedWorkout(user.id, blockId, assignmentId), 'resuming') : undefined} onFinish={() => void finish()} />}><LiveWorkoutDashboard metrics={metrics} timerOnly={value.tracker.timerOnly} operation={pendingAction} phase={dashboardPhase} showControls={false} /><ProgressBar progress={view.overallProgress} label="Guided workout progress" />{view.canManuallyComplete && <Button disabled={busy} label={pendingAction === 'completing' ? 'Saving phase…' : 'Mark distance phase complete'} tone="secondary" onPress={() => user && blockId && assignmentId ? void run(() => completeGuidedUntimedPhase(user.id, blockId, assignmentId), 'completing') : undefined} />}{error && <AppText accessibilityRole="alert" style={styles.liveError}>{error}</AppText>}</LiveWorkoutScreen>;
  return <Screen>
    <PageHeader eyebrow="GUIDED WORKOUT" title={`${value.workout.workout.role}`} description={`${value.workout.workout.date} · Week ${value.workout.workout.week} · ${status}`} />
    {!metrics && <Card tone="moss"><AppText variant="meta" style={styles.research}>RESEARCH PREVIEW · NOT AN ACTIVE PLAN</AppText><AppText variant="title">{phase ? `${phase.kind === 'run' ? 'Run' : phase.kind === 'recovery' || phase.kind === 'walk' ? 'Walk / recovery' : phase.kind} · ${phase.repetition > 1 ? `Repeat ${phase.repetition}` : 'Current phase'}` : 'Workout steps complete'}</AppText>{phase && <><AppText variant="section">{phase.instruction}</AppText><AppText>{phase.purpose}</AppText>{phase.effort && <AppText>Effort · {phase.effort}</AppText>}<AppText variant="display">{view.remainingSeconds === null ? targetText(phase) : clock(view.remainingSeconds)}</AppText>{view.remainingSeconds !== null && <AppText>remaining in this phase</AppText>}</>}
      {view.next && <AppText>Next · {view.next.instruction} · {targetText(view.next)}</AppText>}
      <ProgressBar progress={value.workout.phases.length ? Math.min(1, (view.progress.phaseIndex + (phase?.target.kind === 'duration_seconds' && phase.target.value ? view.elapsedInPhaseSeconds / phase.target.value : 0)) / value.workout.phases.length) : 1} label="Guided workout progress" />
      <AppText>Workout time · {clock(active)} · GPS distance · —</AppText>
    </Card>}
    <Card tone="soft"><AppText variant="label">Voice guidance · Generic system voice</AppText>{speechAvailable === false && <AppText accessibilityRole="alert">System speech is unavailable on this device. GPS tracking will continue normally.</AppText>}{speechAvailable === true && <AppText variant="meta">Voice availability depends on your Android text-to-speech engine and installed language voice.</AppText>}{cuePreferences && <><Button disabled={busy} tone="secondary" label={`Voice guidance: ${cuePreferences.voiceEnabled ? 'On' : 'Off'}`} onPress={() => void updateCuePreference('voiceEnabled')} /><Button disabled={busy || !cuePreferences.voiceEnabled} tone="secondary" label={cuePreferences.muted ? 'Unmute voice cues' : 'Mute voice cues'} onPress={() => void updateCuePreference('muted')} /><Button disabled={busy || !cuePreferences.voiceEnabled || cuePreferences.muted} tone="secondary" label={`10-second countdown: ${cuePreferences.countdownEnabled ? 'On' : 'Off'}`} onPress={() => void updateCuePreference('countdownEnabled')} /></>}</Card>
    {value.progress.status === 'ready' && <Button disabled={busy} label={pendingAction === 'starting' ? 'Starting GPS…' : 'Start guided workout'} onPress={() => user && blockId && assignmentId ? void run(() => startGuidedWorkout(user.id, blockId, assignmentId), 'starting') : undefined} />}
    {view.canManuallyComplete && <Button disabled={busy} label={pendingAction === 'completing' ? 'Saving phase…' : 'Mark distance phase complete'} tone="secondary" onPress={() => user && blockId && assignmentId ? void run(() => completeGuidedUntimedPhase(user.id, blockId, assignmentId), 'completing') : undefined} />}
    {!metrics && trackerStatus && trackerStatus !== 'saved' && trackerStatus !== 'cancelled' && <Button disabled={busy} label={pendingAction === 'finishing' ? 'Saving…' : 'Finish workout'} tone="accent" onPress={() => void finish()} />}
    {trackerStatus === 'saved' && value.progress.status === 'finished' && <Button label="Continue to workout feedback" onPress={() => blockId && assignmentId && value.tracker ? router.replace(researchWorkoutReturnRoute({ blockId, assignmentId, trackingSessionId: value.tracker.session.id }) as Href) : undefined} />}
    {value.progress.status === 'interrupted' && <Card tone="coral"><AppText variant="label">This recording was interrupted</AppText><AppText>It was not resumed automatically. Finish the recorded portion to continue to workout feedback.</AppText></Card>}
    {error && <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText>}
    <Card><AppText variant="label">Workout phases</AppText>{value.workout.phases.map((item, index) => <View key={item.id} style={styles.phaseRow}><AppText variant="meta">{index < value.progress.phaseIndex ? '✓' : index === value.progress.phaseIndex ? 'NOW' : `${index + 1}`}</AppText><View style={styles.phaseCopy}><AppText>{item.instruction}</AppText><AppText variant="meta">{targetText(item)}{item.effort ? ` · ${item.effort}` : ''}</AppText></View></View>)}</Card>
  </Screen>;
}
const styles = StyleSheet.create({ error: { color: colors.error }, liveError: { color: '#FFD5CA' }, phaseCopy: { flex: 1, gap: 3 }, phaseRow: { alignItems: 'flex-start', borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm }, research: { color: colors.onInk } });
