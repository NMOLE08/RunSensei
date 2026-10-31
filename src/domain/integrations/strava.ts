export type StravaConnectionState = 'not_connected' | 'connected' | 'limited_scope' | 'reconnect_required';

export interface StravaConnectionStatus {
  state: StravaConnectionState;
  grantedScopes: string[];
  connectedAt: string | null;
  athleteLabel: string | null;
}

export type StravaCapability =
  | { kind: 'disabled'; reason: 'policy_review' | 'server_not_configured' }
  | { kind: 'requires_account' }
  | { kind: 'available'; status: StravaConnectionStatus; developmentMock: boolean };

export type StravaConnectResult = 'connected' | 'cancelled' | 'denied';

export function parseStravaCompletionUrl(url: string, expectedRedirect: string): { kind: 'success'; ticket: string } | { kind: 'denied' } | { kind: 'invalid' } {
  try {
    const actual = new URL(url); const expected = new URL(expectedRedirect);
    if (actual.protocol !== expected.protocol || actual.host !== expected.host || actual.pathname !== expected.pathname) return { kind: 'invalid' };
    if (actual.searchParams.get('error') === 'access_denied') return { kind: 'denied' };
    const ticket = actual.searchParams.get('ticket');
    if (!ticket || ticket.length < 16 || ticket.length > 512) return { kind: 'invalid' };
    return { kind: 'success', ticket };
  } catch { return { kind: 'invalid' }; }
}

/** Strava API data is not a permitted planning input in the current release. */
export function assertPermittedPlanningSource(source: 'runsensei' | 'self_reported' | 'strava'): void {
  if (source === 'strava') throw new Error('Strava data cannot be used for plan personalization without explicit written authorization.');
}
