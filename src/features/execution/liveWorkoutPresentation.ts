import type { CompletedKmSplit, GpsQualityState, LiveRunMetrics } from '@/domain/tracking/liveRunMetrics';
import type { TrackingState } from '@/domain/tracking/session';
import type { TrackerUiOperation } from '@/domain/tracking/controls';

export function formatActiveTime(activeElapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(activeElapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPace(paceSecPerKm: number | null): string {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) return '—';
  const seconds = Math.round(paceSecPerKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function recentCompletedSplits(splits: readonly CompletedKmSplit[] | null): readonly CompletedKmSplit[] | null {
  return splits === null ? null : splits.filter(split => Number.isFinite(split.paceSecPerKm) && split.paceSecPerKm > 0).slice(-5);
}

/**
 * Faster completed split paces produce taller bars on a common zero baseline.
 * Each value is proportional to speed relative to the fastest visible split.
 */
export function splitBarHeightPercent(split: CompletedKmSplit, visible: readonly CompletedKmSplit[]): number {
  const valid = visible.filter(item => Number.isFinite(item.paceSecPerKm) && item.paceSecPerKm > 0);
  if (!Number.isFinite(split.paceSecPerKm) || split.paceSecPerKm <= 0 || valid.length === 0) return 0;
  const fastest = Math.min(...valid.map(item => item.paceSecPerKm));
  return Math.max(0, Math.min(100, 100 * fastest / split.paceSecPerKm));
}

export function gpsQualityCopy(state: GpsQualityState, timerOnly: boolean): string {
  if (timerOnly) return 'Timer only · GPS distance is unavailable';
  const copy: Record<GpsQualityState, string> = {
    acquiring: 'Finding GPS',
    reliable: 'GPS connected',
    degraded: 'GPS signal is limited',
    stale: 'Waiting for a fresh GPS fix',
    unavailable: 'GPS unavailable',
  };
  return copy[state];
}

export function currentPaceAvailable(metrics: LiveRunMetrics): boolean {
  return metrics.recordingState === 'recording' && metrics.gpsQuality.state !== 'stale' && metrics.rollingPaceSecPerKm !== null;
}

export function dashboardRecordingCopy(metrics: Pick<LiveRunMetrics, 'recordingState' | 'gpsQuality' | 'refreshHealth'>, operation: TrackerUiOperation | 'completing' | null, timerOnly: boolean): { status: string; quality: string } {
  if (metrics.recordingState === 'interrupted' || metrics.recordingState === 'error') return { status: 'Recording needs review', quality: 'Recovery required' };
  if (operation === 'finishing' || metrics.recordingState === 'finishing') return { status: 'Saving workout', quality: 'Finalising recorded activity' };
  if (operation === 'resuming') return { status: 'Resuming safely', quality: 'Confirming GPS recording' };
  if (operation === 'pausing') return { status: 'Pausing', quality: gpsQualityCopy(metrics.gpsQuality.state, timerOnly) };
  if (operation === 'starting' || metrics.recordingState === 'preparing') return { status: 'Preparing workout', quality: gpsQualityCopy(metrics.gpsQuality.state, timerOnly) };
  if (operation === 'discarding') return { status: 'Discarding workout', quality: 'Removing this recording' };
  if (operation === 'completing') return { status: 'Updating workout', quality: gpsQualityCopy(metrics.gpsQuality.state, timerOnly) };
  if (!timerOnly && (metrics.refreshHealth?.status === 'failed' || metrics.refreshHealth?.status === 'stale')) return { status: 'Recording', quality: 'Saved GPS progress is stale; pace is unavailable' };
  if (!timerOnly && metrics.refreshHealth?.status === 'recovering') return { status: 'Recording', quality: 'Refreshing saved GPS progress; pace remains unavailable' };
  if (!timerOnly && metrics.refreshHealth?.status === 'recovered') return { status: 'Recording', quality: 'Saved GPS progress refreshed' };
  const state: Record<TrackingState, { status: string; quality: string }> = {
    idle: { status: 'Not started', quality: 'Workout is ready' }, preparing: { status: 'Preparing workout', quality: gpsQualityCopy(metrics.gpsQuality.state, timerOnly) }, recording: { status: 'Recording', quality: gpsQualityCopy(metrics.gpsQuality.state, timerOnly) }, paused: { status: 'Paused', quality: timerOnly ? 'Timer paused' : 'GPS paused with workout' }, finishing: { status: 'Saving workout', quality: 'Finalising recorded activity' }, saved: { status: 'Workout saved', quality: 'Ready for feedback' }, interrupted: { status: 'Recording needs review', quality: 'Recovery required' }, cancelled: { status: 'Workout discarded', quality: 'This recording was cancelled' }, error: { status: 'Recording needs review', quality: 'Recovery required' },
  };
  return state[metrics.recordingState];
}
