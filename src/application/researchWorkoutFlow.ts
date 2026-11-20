/** A saved GPS run remains a standalone activity until the runner submits a research outcome. */
export const researchWorkoutHistoryRoute = '/(tabs)/history' as const;
export function researchWorkoutSkipForNowRoute() { return researchWorkoutHistoryRoute; }

export function pendingResearchCheckinRoute(input: { blockId: string; assignmentId: string; activityId: string }) {
  return {
    pathname: '/research-foundation' as const,
    params: { blockId: input.blockId, assignmentId: input.assignmentId, activityId: input.activityId, focus: 'feedback' as const },
  };
}

export function researchWorkoutFeedbackRoute(input: { blockId: string; assignmentId: string; trackingSessionId: string }) {
  return pendingResearchCheckinRoute({ blockId: input.blockId, assignmentId: input.assignmentId, activityId: `tracking:${input.trackingSessionId}` });
}

export function researchWorkoutReturnRoute(input: { blockId?: string; assignmentId?: string; trackingSessionId: string }) {
  if (!input.blockId || !input.assignmentId || !input.trackingSessionId) return { pathname: '/history' as const };
  return researchWorkoutFeedbackRoute({ blockId: input.blockId, assignmentId: input.assignmentId, trackingSessionId: input.trackingSessionId });
}
