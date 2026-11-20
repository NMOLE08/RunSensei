import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { LiveRunMetrics } from '@/domain/tracking/liveRunMetrics';
import type { TrackerUiOperation } from '@/domain/tracking/controls';
import { trackerControlState } from '@/domain/tracking/controls';
import { AppText } from '@/design/components';
import { radius, spacing } from '@/design/tokens';
import { currentPaceAvailable, dashboardRecordingCopy, formatActiveTime, formatPace, recentCompletedSplits, splitBarHeightPercent } from './liveWorkoutPresentation';

export type GuidedDashboardPhase = { title: string; detail: string; target: string; purpose: string | null; remaining: string | null; next: string | null; repetition: string | null };
export type LiveWorkoutDashboardProps = {
  metrics: LiveRunMetrics;
  timerOnly: boolean;
  operation: TrackerUiOperation | 'completing' | null;
  onPause?: () => void;
  onResume?: () => void;
  onFinish?: () => void;
  phase?: GuidedDashboardPhase | null;
  showControls?: boolean;
};

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <View accessibilityLabel={`${label}: ${value}${detail ? `. ${detail}` : ''}`} style={styles.metric}>
    <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</AppText>
    <AppText style={styles.metricLabel}>{label}</AppText>
    {detail && <AppText style={styles.metricDetail}>{detail}</AppText>}
  </View>;
}

export const LiveWorkoutDashboard = memo(function LiveWorkoutDashboard({ metrics, timerOnly, operation, onPause, onResume, onFinish, phase, showControls = true }: LiveWorkoutDashboardProps) {
  const controls = trackerControlState(metrics.recordingState, operation === 'completing' ? null : operation);
  const splits = recentCompletedSplits(metrics.completedKmSplits);
  const paceNow = currentPaceAvailable(metrics) ? formatPace(metrics.rollingPaceSecPerKm) : '—';
  const { status, quality } = dashboardRecordingCopy(metrics, operation, timerOnly);
  return <View style={styles.dashboard} accessibilityLabel={`Live workout dashboard. ${status}.`}>
    <View style={styles.statusRow}><View style={[styles.statusDot, metrics.recordingState === 'recording' && styles.statusDotLive]} /><AppText style={styles.status}>{status.toUpperCase()}</AppText><AppText style={styles.quality}>{quality}</AppText></View>
    <View style={styles.timeBlock}><AppText accessibilityLabel={`Active time ${formatActiveTime(metrics.activeElapsedMs)}`} style={styles.time}>{formatActiveTime(metrics.activeElapsedMs)}</AppText><AppText style={styles.timeLabel}>Active time</AppText></View>
    <View style={styles.metricGrid}>
      <Metric label="Distance" value={metrics.distanceMeters === null ? '—' : (metrics.distanceMeters / 1000).toFixed(2)} detail={metrics.distanceMeters === null ? 'GPS unavailable' : 'km'} />
      <Metric label="Average pace" value={formatPace(metrics.averagePaceSecPerKm)} detail={metrics.averagePaceSecPerKm === null ? 'Unavailable' : 'min/km'} />
      <Metric label="Current pace" value={paceNow} detail={paceNow === '—' ? 'Waiting for movement' : 'min/km'} />
    </View>
    {phase && <View style={styles.phase}><AppText style={styles.phaseEyebrow}>CURRENT STEP{phase.repetition ? ` · ${phase.repetition}` : ''}</AppText><View style={styles.phaseTitleRow}><AppText style={styles.phaseTitle}>{phase.title}</AppText>{phase.remaining && <AppText style={styles.phaseRemaining}>{phase.remaining}</AppText>}</View><AppText style={styles.phaseTarget}>{phase.target}</AppText><AppText style={styles.phaseDetail}>{phase.detail}</AppText>{phase.purpose && <AppText style={styles.phasePurpose}>{phase.purpose}</AppText>}{phase.next && <AppText style={styles.phaseNext}>Next · {phase.next}</AppText>}</View>}
    <SplitChart splits={splits} timerOnly={timerOnly} />
    {metrics.recordingState === 'interrupted' && <View accessibilityRole="alert" style={styles.recovery}><AppText style={styles.recoveryTitle}>Recording needs review</AppText><AppText style={styles.recoveryCopy}>It did not resume automatically. Finish the recorded portion or return to the workout recovery flow.</AppText></View>}
    {showControls && <LiveWorkoutControls metrics={metrics} operation={operation} onPause={onPause} onResume={onResume} onFinish={onFinish} />}
  </View>;
});

export function LiveWorkoutControls({ metrics, operation, onPause, onResume, onFinish }: Pick<LiveWorkoutDashboardProps, 'metrics' | 'operation' | 'onPause' | 'onResume' | 'onFinish'>) {
  const controls = trackerControlState(metrics.recordingState, operation === 'completing' ? null : operation);
  const busy = operation !== null;
  return <View style={styles.controls}>
    {controls.pauseVisible && <DashboardButton label={operation === 'pausing' ? 'Pausing…' : 'Pause'} tone="pause" disabled={busy} onPress={onPause} />}
    {controls.resumeVisible && <DashboardButton label={controls.resumeLabel} tone="resume" disabled={busy || metrics.recordingState === 'interrupted'} onPress={onResume} />}
    {controls.finishVisible && <DashboardButton label={operation === 'finishing' ? 'Saving…' : 'Finish'} tone="finish" disabled={busy} onPress={onFinish} />}
  </View>;
}

const SplitChart = memo(function SplitChart({ splits, timerOnly }: { splits: readonly import('@/domain/tracking/liveRunMetrics').CompletedKmSplit[] | null; timerOnly: boolean }) {
  if (timerOnly) return <View style={styles.splits}><AppText style={styles.splitTitle}>Kilometre splits</AppText><AppText style={styles.emptyCopy}>Splits are unavailable for a timer-only workout.</AppText></View>;
  if (splits === null) return <View style={styles.splits}><AppText style={styles.splitTitle}>Kilometre splits</AppText><AppText style={styles.emptyCopy}>Splits are unavailable for this older recording.</AppText></View>;
  if (splits.length === 0) return <View style={styles.splits}><AppText style={styles.splitTitle}>Kilometre splits</AppText><AppText style={styles.emptyCopy}>Your completed kilometres will appear here.</AppText></View>;
  const summary = splits.map(item => `Kilometre ${item.kilometre}, ${formatPace(item.paceSecPerKm)} per kilometre`).join('. ');
  return <View accessibilityLabel={`Recent kilometre splits. ${summary}`} style={styles.splits}>
    <AppText style={styles.splitTitle}>Recent splits</AppText><View style={styles.barRow}>{splits.map(split => <View key={split.id} style={styles.barColumn}><AppText style={styles.barPace}>{formatPace(split.paceSecPerKm)}</AppText><View style={styles.barTrack}><View style={[styles.bar, { height: `${splitBarHeightPercent(split, splits)}%` }]} /></View><AppText style={styles.barKm}>KM {split.kilometre}</AppText></View>)}</View><AppText style={styles.splitNote}>Faster splits are taller. Based on the latest {splits.length} completed kilometre{splits.length === 1 ? '' : 's'}.</AppText>
    {splits.some(split => split.gpsCoverage === 'gaps') && <AppText style={styles.coverage}>Some splits include a GPS coverage gap.</AppText>}
  </View>;
});

function DashboardButton({ label, tone, disabled, onPress }: { label: string; tone: 'pause' | 'resume' | 'finish'; disabled: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.control, tone === 'pause' && styles.pause, tone === 'resume' && styles.resume, tone === 'finish' && styles.finish, disabled && styles.disabled]}><AppText style={[styles.controlText, tone === 'finish' && styles.finishText]}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  dashboard: { backgroundColor: '#101512', borderRadius: 28, gap: spacing.lg, marginHorizontal: -spacing.md, minHeight: 420, padding: spacing.lg },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, statusDot: { backgroundColor: '#818980', borderRadius: 5, height: 10, width: 10 }, statusDotLive: { backgroundColor: '#9BB58B' }, status: { color: '#F7F8F1', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }, quality: { color: '#B8C2B2', flexShrink: 1, fontSize: 13, marginLeft: 'auto' },
  timeBlock: { alignItems: 'center', gap: 2, paddingVertical: spacing.sm }, time: { color: '#FFFFFF', fontSize: 52, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -2, lineHeight: 60 }, timeLabel: { color: '#C9D0C2', fontSize: 15, fontWeight: '700' },
  metricGrid: { borderTopColor: 'rgba(245, 250, 241, 0.12)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.lg }, metric: { flex: 1, minWidth: 0 }, metricValue: { color: '#FFFFFF', fontSize: 25, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -0.8, lineHeight: 31 }, metricLabel: { color: '#DFE6DA', fontSize: 13, fontWeight: '700', marginTop: 3 }, metricDetail: { color: '#9DA99A', fontSize: 12, marginTop: 1 },
  phase: { backgroundColor: 'rgba(136, 166, 118, 0.18)', borderColor: 'rgba(172, 201, 150, 0.32)', borderRadius: radius.large, borderWidth: StyleSheet.hairlineWidth, gap: 5, padding: spacing.md }, phaseEyebrow: { color: '#B9D3A9', fontSize: 11, fontWeight: '800', letterSpacing: 1 }, phaseTitleRow: { alignItems: 'baseline', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }, phaseTitle: { color: '#FFFFFF', flex: 1, fontSize: 20, fontWeight: '800' }, phaseRemaining: { color: '#D4E8C8', fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '800' }, phaseTarget: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' }, phaseDetail: { color: '#D4DDD0', fontSize: 14 }, phasePurpose: { color: '#B8C2B2', fontSize: 13 }, phaseNext: { color: '#AAB6A4', fontSize: 13, marginTop: 2 },
  splits: { borderTopColor: 'rgba(245, 250, 241, 0.12)', borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.lg }, splitTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' }, emptyCopy: { color: '#B8C2B2', fontSize: 14 }, barRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm, height: 138 }, barColumn: { alignItems: 'center', flex: 1, gap: 5, height: '100%', justifyContent: 'flex-end' }, barPace: { color: '#F7F8F1', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' }, barTrack: { backgroundColor: 'rgba(214, 230, 201, 0.13)', borderRadius: 8, height: 92, justifyContent: 'flex-end', overflow: 'hidden', width: '100%' }, bar: { backgroundColor: '#9BB58B', borderRadius: 8, minHeight: 4, width: '100%' }, barKm: { color: '#B8C2B2', fontSize: 11, fontWeight: '800' }, splitNote: { color: '#9DA99A', fontSize: 11, lineHeight: 16 }, coverage: { color: '#E9D58C', fontSize: 12 },
  recovery: { backgroundColor: 'rgba(241,100,71,0.14)', borderColor: 'rgba(241,100,71,0.4)', borderRadius: radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: 4, padding: spacing.md }, recoveryTitle: { color: '#FFD5CA', fontSize: 16, fontWeight: '800' }, recoveryCopy: { color: '#F7D5CC', fontSize: 13, lineHeight: 19 },
  controls: { flexDirection: 'row', gap: spacing.sm }, control: { alignItems: 'center', borderRadius: radius.large, flex: 1, justifyContent: 'center', minHeight: 58, paddingHorizontal: spacing.md }, pause: { backgroundColor: '#F16447' }, resume: { backgroundColor: '#9BB58B' }, finish: { backgroundColor: 'transparent', borderColor: 'rgba(245,250,241,0.42)', borderWidth: 1 }, disabled: { opacity: 0.46 }, controlText: { color: '#172016', fontSize: 17, fontWeight: '800' }, finishText: { color: '#F7F8F1' },
});
