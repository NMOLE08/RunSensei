import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, View, type ImageErrorEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppText, Button, Card, Screen } from '@/design/components';
import { colors, radius, spacing } from '@/design/tokens';
import { JETT_INTRO_DURATION_SECONDS, jettMouthStateAt } from '@/domain/jettLipSync';
import { TalkingJettPlaybackController, type TalkingJettPlaybackState } from '@/domain/talkingJettPlayback';
import { jettFrameAssets, jettIntroAudio } from './jettLipSyncAssets';

const STATUS_INTERVAL_MS = 50;
type SpriteLoadStatus = 'pending' | 'loaded' | 'error';

export function TalkingJettLab() {
  const player = useAudioPlayer(jettIntroAudio, { downloadFirst: true, updateInterval: STATUS_INTERVAL_MS });
  const audioStatus = useAudioPlayerStatus(player);
  const [playbackState, setPlaybackState] = useState<TalkingJettPlaybackState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [spriteStatus, setSpriteStatus] = useState<SpriteLoadStatus>('pending');
  const [spriteError, setSpriteError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState({ updates: 0, lastGapMs: null as number | null, largestGapMs: 0 });
  const lastStatusUpdateRef = useRef<number | null>(null);
  const [controller] = useState(() => new TalkingJettPlaybackController(player, setPlaybackState));

  const stopForExit = useCallback((reportError: boolean) => {
    void controller.stop().catch((cause) => { if (reportError) setError(errorMessage(cause)); });
  }, [controller]);
  useFocusEffect(useCallback(() => () => stopForExit(false), [stopForExit]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') stopForExit(true);
    });
    return () => subscription.remove();
  }, [stopForExit]);
  useEffect(() => () => { void controller.dispose().catch(() => undefined); }, [controller]);
  useEffect(() => {
    void setAudioModeAsync({ interruptionMode: 'duckOthers', playsInSilentMode: true, shouldPlayInBackground: false })
      .catch((cause) => setError(`Audio mode could not be configured: ${errorMessage(cause)}`));
  }, []);
  useEffect(() => {
    const now = Date.now(); const prior = lastStatusUpdateRef.current;
    if (prior !== null) setTelemetry((value) => ({ updates: value.updates + 1, lastGapMs: now - prior, largestGapMs: Math.max(value.largestGapMs, now - prior) }));
    else setTelemetry((value) => ({ ...value, updates: value.updates + 1 }));
    lastStatusUpdateRef.current = now;
  }, [audioStatus.currentTime, audioStatus.playing, audioStatus.didJustFinish]);
  useEffect(() => { if (audioStatus.didJustFinish) void controller.completed().catch((cause) => setError(errorMessage(cause))); }, [audioStatus.didJustFinish, controller]);

  const invoke = (operation: () => Promise<void>) => { setError(null); void operation().catch((cause) => setError(errorMessage(cause))); };
  const play = () => {
    if (!audioStatus.isLoaded) { setError('Jett audio is still loading. Wait for “Loaded: true”, then tap Play again.'); return; }
    invoke(() => controller.play());
  };
  const recordSpriteError = (event: ImageErrorEvent) => {
    const message = event.nativeEvent.error || 'Android could not decode the Jett sprite.';
    setSpriteStatus('error'); setSpriteError(message);
  };
  const displayPosition = playbackState === 'stopped' || playbackState === 'completed' || playbackState === 'idle' ? 0 : audioStatus.currentTime;
  const mouth = jettMouthStateAt(displayPosition);
  const isPlaying = playbackState === 'playing';

  return <Screen>
    <Card style={styles.warning}><AppText variant="meta">DEVELOPER AUDIO LAB / RESEARCH ONLY</AppText><AppText variant="title">Talking Jett</AppText><AppText>Full-frame sprite switching test. These source frames have known eye, ear, whisker and muzzle differences, so visual jitter is expected.</AppText></Card>
    <Card style={styles.stageCard}>
      <View style={styles.stage} testID="jett-sprite-stage"><Image accessibilityLabel={`Jett mouth state ${mouth}`} onError={recordSpriteError} onLoad={() => { setSpriteStatus('loaded'); setSpriteError(null); }} resizeMode="contain" source={jettFrameAssets[mouth]} style={styles.jett} testID="jett-sprite" /></View>
      <AppText variant="section">Mouth state · {mouth}</AppText>
      <AppText>{formatTime(displayPosition)} / {formatTime(JETT_INTRO_DURATION_SECONDS)}</AppText>
      <View style={styles.controls}>
        <Button disabled={isPlaying} label="Play" onPress={play} />
        <Button disabled={!isPlaying} label="Pause" tone="secondary" onPress={() => invoke(() => controller.pause())} />
        <Button disabled={playbackState !== 'paused'} label="Resume" tone="secondary" onPress={() => invoke(() => controller.resume())} />
        <Button label="Replay" tone="quiet" onPress={() => invoke(() => controller.replay())} />
        <Button disabled={playbackState === 'idle' || playbackState === 'stopped'} label="Stop" tone="quiet" onPress={() => invoke(() => controller.stop())} />
      </View>
    </Card>
    <Card style={styles.debug}><AppText variant="meta">DEBUG / ASSET AND PLAYER STATUS</AppText><AppText>Sprite X: {spriteStatus}{spriteError ? ` · ${spriteError}` : ''}</AppText><AppText>State: {playbackState} · Native playing: {String(audioStatus.playing)} · Loaded: {String(audioStatus.isLoaded)}</AppText><AppText>Duration: {audioStatus.duration.toFixed(3)} s · Muted: {String(audioStatus.mute)} · Buffering: {String(audioStatus.isBuffering)}</AppText><AppText>Native state: {audioStatus.playbackState} · Control: {audioStatus.timeControlStatus}{audioStatus.reasonForWaitingToPlay ? ` · Waiting: ${audioStatus.reasonForWaitingToPlay}` : ''}</AppText><AppText>Audio time: {audioStatus.currentTime.toFixed(3)} s · Active mouth: {mouth}</AppText><AppText>Requested status interval: {STATUS_INTERVAL_MS} ms · Updates: {telemetry.updates}</AppText><AppText>Latest callback gap: {telemetry.lastGapMs ?? 'waiting'} ms · Largest: {telemetry.largestGapMs} ms</AppText><AppText variant="meta">Android timing suitability is unverified until this build is tested on-device.</AppText></Card>
    {error && <Card><AppText style={styles.error}>{error}</AppText></Card>}
  </Screen>;
}

function formatTime(value: number): string { const seconds = Number.isFinite(value) && value > 0 ? value : 0; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function errorMessage(cause: unknown): string { return cause instanceof Error ? `Audio action failed: ${cause.message}` : 'Audio action failed. Try Replay.'; }

const styles = StyleSheet.create({
  warning: { borderColor: colors.periwinkle, borderWidth: 2 },
  stageCard: { alignItems: 'center', gap: spacing.sm },
  stage: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.canvas, borderColor: colors.divider, borderRadius: radius.medium, borderWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  jett: { alignSelf: 'center', aspectRatio: 512 / 576, maxWidth: 512, width: '100%' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  debug: { gap: 4 },
  error: { color: colors.error },
});
