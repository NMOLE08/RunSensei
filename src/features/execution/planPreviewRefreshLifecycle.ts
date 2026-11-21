import { planPreviewIdentityKey, type PlanPreviewIdentity } from '@/application/planPreviewIdentity';

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

export function selectedPreviewWeek(weeksByIdentity: Readonly<Record<string, number>>, identity: string, maximumWeek: number): number {
  return Math.max(1, Math.min(maximumWeek, weeksByIdentity[identity] ?? 1));
}

export function saveSelectedPreviewWeek(weeksByIdentity: Readonly<Record<string, number>>, identity: string, week: number, maximumWeek: number): Record<string, number> {
  const nextWeek = Math.max(1, Math.min(maximumWeek, week));
  if (weeksByIdentity[identity] === nextWeek) return weeksByIdentity;
  const entries = Object.entries(weeksByIdentity).filter(([key]) => key !== identity);
  // This is screen-local continuity, not persisted programme state. Retaining a
  // small recent set avoids carrying stale account/programme selections forever.
  const retained = entries.slice(-11);
  return Object.fromEntries([...retained, [identity, nextWeek]]);
}
