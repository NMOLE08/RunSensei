import { pendingResearchCheckinRoute, researchWorkoutFeedbackRoute, researchWorkoutHistoryRoute, researchWorkoutReturnRoute, researchWorkoutSkipForNowRoute } from '@/application/researchWorkoutFlow';

test('a saved GPS run started from a research workout returns to that exact check-in', () => {
  expect(researchWorkoutReturnRoute({ blockId: 'block-a', assignmentId: 'block-a:w1:A', trackingSessionId: 'track-123' })).toEqual({
    pathname: '/research-foundation',
    params: { blockId: 'block-a', assignmentId: 'block-a:w1:A', activityId: 'tracking:track-123', focus: 'feedback' },
  });
});

test('standalone and incomplete-context GPS runs continue to activity history', () => {
  expect(researchWorkoutReturnRoute({ trackingSessionId: 'track-123' })).toEqual({ pathname: '/history' });
  expect(researchWorkoutReturnRoute({ blockId: 'block-a', trackingSessionId: 'track-123' })).toEqual({ pathname: '/history' });
});

test('post-workout save and Skip for now return directly to History', () => {
  expect(researchWorkoutHistoryRoute).toBe('/(tabs)/history');
  expect(researchWorkoutSkipForNowRoute()).toBe('/(tabs)/history');
});

test('a restart recovery action and the immediate finish handoff open the same exact check-in', () => {
  const pending = { blockId: 'block-a', assignmentId: 'block-a:w1:A', activityId: 'tracking:track-123' };
  expect(pendingResearchCheckinRoute(pending)).toEqual(researchWorkoutFeedbackRoute({ blockId: pending.blockId, assignmentId: pending.assignmentId, trackingSessionId: 'track-123' }));
  expect(researchWorkoutReturnRoute({ blockId: pending.blockId, assignmentId: pending.assignmentId, trackingSessionId: 'track-123' })).toEqual(pendingResearchCheckinRoute(pending));
});
