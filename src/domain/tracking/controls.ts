import type { TrackingState } from './session';

export type TrackerUiOperation = 'starting' | 'pausing' | 'resuming' | 'finishing' | 'discarding' | null;

export function trackerControlState(status: TrackingState, operation: TrackerUiOperation = null) {
  const visibleStatus = operation === 'resuming' ? 'RESUMING'
    : operation === 'pausing' ? 'PAUSING'
    : operation === 'finishing' ? 'FINISHING'
    : status === 'recording' ? 'RUNNING'
    : status.toUpperCase();
  return {
    visibleStatus,
    pauseVisible: status === 'recording',
    resumeVisible: status === 'paused',
    resumeLabel: operation === 'resuming' ? 'Resuming…' : 'Resume',
    finishVisible: status === 'recording' || status === 'paused' || status === 'interrupted' || status === 'finishing',
  } as const;
}
