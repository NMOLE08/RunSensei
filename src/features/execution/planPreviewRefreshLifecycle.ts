import { planPreviewIdentityKey, samePlanPreviewIdentity, type PlanPreviewIdentity } from '@/application/planPreviewIdentity';

/**
 * The Plan screen receives fresh availability objects on every storage read.
 * Keep the first context for an equivalent identity so React dependencies stay
 * stable without dropping any input that makes a preview unsafe to reuse.
 */
export function retainEquivalentPreviewContext(
  previous: PlanPreviewIdentity | null,
  incoming: PlanPreviewIdentity | null,
): PlanPreviewIdentity | null {
  if (previous && incoming && samePlanPreviewIdentity(previous, incoming)) return previous;
  return incoming;
}

export type PlanFocusRefreshState = Readonly<{ hasReceivedFocus: boolean }>;

export const initialPlanFocusRefreshState: PlanFocusRefreshState = { hasReceivedFocus: false };

/**
 * The data hooks load once on mount. Later focus transitions refresh their
 * authoritative sources, but preview regeneration is driven by a semantic
 * preview-context change inside its own hook.
 */
export function nextPlanFocusRefresh(state: PlanFocusRefreshState): Readonly<{
  state: PlanFocusRefreshState;
  refreshActivePlan: boolean;
  refreshAvailability: boolean;
}> {
  if (!state.hasReceivedFocus) {
    return { state: { hasReceivedFocus: true }, refreshActivePlan: false, refreshAvailability: false };
  }
  return { state, refreshActivePlan: true, refreshAvailability: true };
}

export function shouldRequestPreviewForContext(
  previousIdentity: string | null,
  enabled: boolean,
  context: PlanPreviewIdentity | null,
): boolean {
  if (!enabled || !context) return false;
  return previousIdentity !== planPreviewIdentityKey(context);
}

export function shouldApplyPreviewRequest(currentRequestId: number, completedRequestId: number): boolean {
  return currentRequestId === completedRequestId;
}
