import type { CompletedKmSplit } from '@/domain/tracking/liveRunMetrics';
import { currentPaceAvailable, dashboardRecordingCopy, formatActiveTime, formatPace, gpsQualityCopy, recentCompletedSplits, splitBarHeightPercent } from '@/features/execution/liveWorkoutPresentation';

function split(kilometre: number, paceSecPerKm: number): CompletedKmSplit {
  return { id: `split-${kilometre}`, kilometre, crossingActiveMs: kilometre * 300000, durationMs: paceSecPerKm * 1000, paceSecPerKm, gpsCoverage: 'continuous', metricVersion: 3, splitVersion: 1 };
}

describe('live workout presentation', () => {
  it('formats active time and preserves unavailable pace as a dash', () => {
    expect(formatActiveTime(3723000)).toBe('01:02:03');
    expect(formatPace(null)).toBe('—');
    expect(formatPace(367)).toBe('6:07');
  });

  it('uses the five most recent persisted kilometre splits', () => {
    const values = Array.from({ length: 7 }, (_, index) => split(index + 1, 300 + index));
    expect(recentCompletedSplits(values)?.map(item => item.kilometre)).toEqual([3, 4, 5, 6, 7]);
    expect(recentCompletedSplits([])).toEqual([]);
    expect(recentCompletedSplits(null)).toBeNull();
  });

  it('scales bars deterministically with faster paces taller and one split neutral', () => {
    const visible = [split(1, 360), split(2, 300), split(3, 330)];
    expect(splitBarHeightPercent(visible[1]!, visible)).toBe(100);
    expect(splitBarHeightPercent(visible[0]!, visible)).toBeCloseTo(83.3333, 3);
    expect(splitBarHeightPercent(split(1, 300), [split(1, 300)])).toBe(100);
    expect(splitBarHeightPercent(split(2, 301), [split(1, 300), split(2, 301)])).toBeCloseTo(99.667, 2);
  });

  it('uses user-facing GPS quality copy and does not show stale rolling pace', () => {
    expect(gpsQualityCopy('degraded', false)).toBe('GPS signal is limited');
    expect(gpsQualityCopy('reliable', true)).toBe('Timer only · GPS distance is unavailable');
    const metrics = { recordingState: 'recording', gpsQuality: { state: 'stale' }, rollingPaceSecPerKm: 300 } as never;
    expect(currentPaceAvailable(metrics)).toBe(false);
    expect(currentPaceAvailable({ ...metrics, gpsQuality: { state: 'reliable' } })).toBe(true);
  });

  it('keeps paused, resuming, and interrupted states distinct from GPS loss', () => {
    const base = { recordingState: 'recording', gpsQuality: { state: 'reliable' } } as never;
    expect(dashboardRecordingCopy({ ...base, recordingState: 'paused' }, null, false)).toEqual({ status: 'Paused', quality: 'GPS paused with workout' });
    expect(dashboardRecordingCopy(base, 'resuming', false)).toEqual({ status: 'Resuming safely', quality: 'Confirming GPS recording' });
    expect(dashboardRecordingCopy({ ...base, recordingState: 'interrupted' }, null, false)).toEqual({ status: 'Recording needs review', quality: 'Recovery required' });
  });

  it('uses terminal states and pending actions instead of optimistic recording copy', () => {
    const base = { recordingState: 'paused', gpsQuality: { state: 'reliable' } } as never;
    expect(dashboardRecordingCopy(base, 'resuming', false).status).toBe('Resuming safely');
    expect(dashboardRecordingCopy(base, 'finishing', false).status).toBe('Saving workout');
    expect(dashboardRecordingCopy({ ...base, recordingState: 'saved' }, null, false).status).toBe('Workout saved');
    expect(dashboardRecordingCopy({ ...base, recordingState: 'cancelled' }, null, false).status).toBe('Workout discarded');
    expect(dashboardRecordingCopy({ ...base, recordingState: 'error' }, null, false).status).toBe('Recording needs review');
  });

  it('distinguishes a stale saved checkpoint from GPS signal quality', () => {
    const base = { recordingState: 'recording', gpsQuality: { state: 'reliable' }, refreshHealth: { status: 'failed' } } as never;
    expect(dashboardRecordingCopy(base, null, false)).toEqual({ status: 'Recording', quality: 'Saved GPS progress is stale; pace is unavailable' });
    expect(dashboardRecordingCopy({ ...base, refreshHealth: { status: 'recovering' } }, null, false)).toEqual({ status: 'Recording', quality: 'Refreshing saved GPS progress; pace remains unavailable' });
    expect(dashboardRecordingCopy({ ...base, refreshHealth: { status: 'recovered' } }, null, false)).toEqual({ status: 'Recording', quality: 'Saved GPS progress refreshed' });
  });
});
