import { getAuthenticatedAccountId, requireActiveAccountId } from './localAccount';

/** Tracker records are always scoped to the authenticated Supabase user. */
export async function getTrackerOwnerId(options: { readOnly?: boolean } = {}): Promise<string> {
  return options.readOnly ? getAuthenticatedAccountId() : requireActiveAccountId();
}
