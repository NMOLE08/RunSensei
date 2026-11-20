import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { connectStrava, disconnectStrava, loadStravaCapability } from '@/services/strava/gateway';
import type { StravaCapability } from '@/domain/integrations/strava';
import { stravaActivityViewerEnabled, stravaPersonalizationEnabled } from '@/config/productMode';
import { AppText, Button, Card, Screen } from '@/design/components';
import { TORTO_NAME } from '@/config/productIdentity';

export default function StravaIntegrationScreen() {
  const [capability, setCapability] = useState<StravaCapability | null>(null); const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => loadStravaCapability().then(setCapability).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Strava status is unavailable.')), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const connect = async () => { if (busy) return; setBusy(true); setMessage(null); try { const result = await connectStrava(); setMessage(result === 'connected' ? 'Strava connection confirmed.' : result === 'denied' ? 'Strava access was declined. Nothing was connected.' : 'Strava connection was cancelled.'); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Strava could not be connected.'); } finally { setBusy(false); } };
  const disconnect = async () => { if (busy) return; setBusy(true); setMessage(null); try { await disconnectStrava(); setMessage(`Strava was disconnected. Independent ${TORTO_NAME} recordings were not deleted.`); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Strava could not be disconnected.'); } finally { setBusy(false); } };
  const connected = capability?.kind === 'available' && capability.status.state === 'connected';
  return <Screen><AppText variant="meta">SETTINGS / CONNECTED APPS</AppText><AppText variant="title">Strava</AppText>
    <Card><AppText variant="title">Optional connection</AppText><AppText>Strava is never required to record a {TORTO_NAME} activity. Tokens and the Strava client secret must remain on the server.</AppText><AppText>Strava activity import and plan personalization are disabled. Current Strava policy requires product authorization before those uses can be enabled.</AppText></Card>
    {!capability && <AppText>Checking connection capability…</AppText>}
    {capability?.kind === 'disabled' && <Card><AppText variant="title">Not available yet</AppText><AppText>The connection is gated until the server credentials, callback, deletion flow, and Strava product-policy review are complete.</AppText></Card>}
    {capability?.kind === 'requires_account' && <Card><AppText variant="title">{TORTO_NAME} account required</AppText><AppText>A secure server-side Strava connection must be attached to an authenticated {TORTO_NAME} account. Guest tracking remains available without it.</AppText></Card>}
    {capability?.kind === 'available' && <Card><AppText variant="title">{connected ? 'Connected' : 'Not connected'}</AppText>{capability.developmentMock && <AppText>Development mock only — no Strava account or data is connected.</AppText>}{connected && <><AppText>{capability.status.athleteLabel ?? 'Connected athlete'}</AppText><AppText>Granted scopes: {capability.status.grantedScopes.join(', ') || 'not reported'}</AppText></>}<Button label={busy ? 'Please wait…' : connected ? 'Disconnect Strava' : 'Connect with Strava'} onPress={busy ? undefined : connected ? () => Alert.alert('Disconnect Strava?', 'The server must revoke access and purge any permitted transient cache.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: () => { void disconnect(); } }]) : () => { void connect(); }} tone={connected ? 'secondary' : 'primary'} /></Card>}
    <Card><AppText variant="meta">CAPABILITIES</AppText><AppText>Read-only activity viewer: {stravaActivityViewerEnabled ? 'enabled' : 'disabled'}</AppText><AppText>Strava-based personalization: {stravaPersonalizationEnabled ? 'enabled' : 'disabled'}</AppText></Card>
    {message && <Card><AppText accessibilityLiveRegion="polite">{message}</AppText></Card>}
  </Screen>;
}
