import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { stravaEnabled, stravaMockEnabled } from '@/config/productMode';
import { parseStravaCompletionUrl, type StravaCapability, type StravaConnectResult, type StravaConnectionStatus } from '@/domain/integrations/strava';

const disconnected: StravaConnectionStatus = { state: 'not_connected', grantedScopes: [], connectedAt: null, athleteLabel: null };
let mockConnected = false;

async function authenticatedClient() {
  const { supabase } = await import('@/services/auth/supabase');
  const { data } = await supabase.auth.getSession();
  return data.session ? { supabase, session: data.session } : null;
}

export async function loadStravaCapability(): Promise<StravaCapability> {
  if (stravaMockEnabled) return { kind: 'available', developmentMock: true, status: mockConnected ? { state: 'connected', grantedScopes: ['read', 'activity:read'], connectedAt: new Date().toISOString(), athleteLabel: 'Development mock athlete' } : disconnected };
  if (!stravaEnabled) return { kind: 'disabled', reason: 'policy_review' };
  const client = await authenticatedClient(); if (!client) return { kind: 'requires_account' };
  const { data, error } = await client.supabase.functions.invoke<StravaConnectionStatus>('strava-status');
  if (error || !data) throw new Error('Strava connection status is temporarily unavailable.');
  return { kind: 'available', developmentMock: false, status: data };
}

export async function connectStrava(): Promise<StravaConnectResult> {
  if (stravaMockEnabled) { mockConnected = true; return 'connected'; }
  if (!stravaEnabled) throw new Error('Strava connection is disabled pending product-policy review and server configuration.');
  const client = await authenticatedClient(); if (!client) throw new Error('Sign in to a RunSensei account before connecting Strava.');
  const redirectTo = Linking.createURL('integrations/strava-complete');
  const { data, error } = await client.supabase.functions.invoke<{ authorizeUrl: string }>('strava-start', { body: { redirectTo } });
  if (error || !data?.authorizeUrl?.startsWith('https://')) throw new Error('Strava authorization could not be started.');
  const browser = await WebBrowser.openAuthSessionAsync(data.authorizeUrl, redirectTo);
  if (browser.type !== 'success') return 'cancelled';
  const completion = parseStravaCompletionUrl(browser.url, redirectTo);
  if (completion.kind === 'denied') return 'denied';
  if (completion.kind !== 'success') throw new Error('Strava returned an invalid completion response.');
  const verified = await client.supabase.functions.invoke<StravaConnectionStatus>('strava-status', { body: { ticket: completion.ticket } });
  if (verified.error || verified.data?.state !== 'connected') throw new Error('Strava connection could not be verified.');
  return 'connected';
}

export async function disconnectStrava(): Promise<void> {
  if (stravaMockEnabled) { mockConnected = false; return; }
  if (!stravaEnabled) return;
  const client = await authenticatedClient(); if (!client) throw new Error('Sign in before disconnecting Strava.');
  const { error } = await client.supabase.functions.invoke('strava-disconnect');
  if (error) throw new Error('Strava could not be disconnected. Try again.');
}
