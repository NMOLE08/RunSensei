import { reconcileBackgroundGuidedCues } from '@/application/backgroundGuidedCues';

const mockGetBlock = jest.fn();
const mockGetProgress = jest.fn();
const mockCompareAndSwap = jest.fn();
const mockResolveWorkout = jest.fn();
const mockReconcileProgress = jest.fn();
const mockActiveSeconds = jest.fn();
const mockEmitProgressCues = jest.fn();
const mockDispatchCue = jest.fn();

jest.mock('@/data/researchFoundationRepository', () => ({ ResearchFoundationRepository: jest.fn().mockImplementation(() => ({ get: mockGetBlock })) }));
jest.mock('@/data/guidedWorkoutProgressRepository', () => ({ GuidedWorkoutProgressRepository: jest.fn().mockImplementation(() => ({ get: mockGetProgress, compareAndSwap: mockCompareAndSwap })) }));
jest.mock('@/data/guidedCuePreferencesRepository', () => ({ GuidedCuePreferencesRepository: jest.fn().mockImplementation(() => ({ get: jest.fn(async () => ({ voiceEnabled: true, muted: false, countdownEnabled: true })) })) }));
jest.mock('@/domain/tracking/guidedWorkout', () => ({ resolveGuidedWorkout: (...args: unknown[]) => mockResolveWorkout(...args), reconcileGuidedProgress: (...args: unknown[]) => mockReconcileProgress(...args) }));
jest.mock('@/domain/tracking/session', () => ({ strictActiveSeconds: (...args: unknown[]) => mockActiveSeconds(...args) }));
jest.mock('@/domain/tracking/workoutCueEvents', () => ({ countdownCue: jest.fn(() => ({ ownerId: 'owner', sessionId: 'session', eventId: 'countdown', kind: 'countdown', text: '10 seconds', phaseId: 'phase', priority: 1 })), isCountdownCrossing: jest.fn(() => false) }));
jest.mock('@/application/guidedWorkoutCues', () => ({ emitGuidedProgressCues: (...args: unknown[]) => mockEmitProgressCues(...args), dispatchGuidedCue: (...args: unknown[]) => mockDispatchCue(...args) }));

test('headless cue failure cannot escape background reconciliation or undo persisted guided phase progress', async () => {
  const phase = { id: 'phase', target: { kind: 'duration_seconds', value: 30 } };
  const workout = { phases: [phase], snapshotFingerprint: 'fingerprint' };
  const oldRecord = { id: 'progress', ownerId: 'owner', blockId: 'block', assignmentId: 'assignment', trackingSessionId: 'session', snapshotFingerprint: 'fingerprint', revision: 2, progress: { status: 'running', phaseIndex: 0, phaseStartedAtActiveSeconds: 0, completedPhases: [] } };
  const nextProgress = { ...oldRecord.progress, phaseIndex: 1 };
  mockGetBlock.mockResolvedValue({ id: 'block' }); mockResolveWorkout.mockReturnValue(workout); mockGetProgress.mockResolvedValue(oldRecord); mockActiveSeconds.mockReturnValueOnce(0).mockReturnValueOnce(30); mockReconcileProgress.mockReturnValue(nextProgress); mockCompareAndSwap.mockResolvedValue({ ...oldRecord, revision: 3, progress: nextProgress }); mockEmitProgressCues.mockRejectedValue(new Error('TTS unavailable'));
  await expect(reconcileBackgroundGuidedCues({} as never, { id: 'session', owner_id: 'owner', state: 'recording', prescription_json: JSON.stringify({ kind: 'guided_research', blockId: 'block', assignmentId: 'assignment', snapshotFingerprint: 'fingerprint' }), segments_json: JSON.stringify([{ startedAtMs: 0, endedAtMs: null }]), checkpoint_at_ms: 0 }, 30_000)).resolves.toBeUndefined();
  expect(mockCompareAndSwap).toHaveBeenCalledTimes(1);
  expect(mockEmitProgressCues).toHaveBeenCalledWith(expect.anything(), 'owner', 'session', workout, 0, nextProgress, 'background');
});
