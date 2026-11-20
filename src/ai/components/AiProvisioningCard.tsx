import { useCallback, useEffect, useRef, useState } from 'react';
import { QWEN_MODEL, requiredModelStorageBytes } from '@/ai/modelManifest';
import { localModelManager } from '@/ai/runtime/localModel';
import type { LocalModelState } from '@/ai/runtime/LocalModelManager';
import { currentProvisioningNetwork, provisionLocalModel, type ProvisioningNetwork } from '@/ai/runtime/modelProvisioning';
import { AppText, Button, Card } from '@/design/components';

const formatSize = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;

const titleFor = (state: LocalModelState): string => {
  switch (state.kind) {
    case 'checking': return 'Checking AI engine';
    case 'not_downloaded': return 'Preparing AI engine';
    case 'downloading': return `Downloading Qwen3.5 2B — ${Math.floor(state.progress.fraction * 100)}%`;
    case 'paused': return 'AI download paused';
    case 'verifying': return 'Verifying model';
    case 'available': return 'Initializing local AI';
    case 'loading': return 'Initializing local AI';
    case 'ready': return 'AI coach ready';
    case 'unsupported': return 'Unsupported device';
    case 'error': return state.code === 'insufficient_storage' ? 'Insufficient storage' : 'Download interrupted';
  }
};

export function AiProvisioningCard() {
  const [state, setState] = useState(localModelManager.getState());
  const [network, setNetwork] = useState<ProvisioningNetwork>('other');
  const [notice, setNotice] = useState<string | null>(null);
  const automaticAttempted = useRef(false);
  useEffect(() => localModelManager.subscribe(setState), []);
  useEffect(() => { void localModelManager.inspect(); void currentProvisioningNetwork().then(setNetwork).catch(() => setNetwork('other')); }, []);

  const start = useCallback(async (allowMetered: boolean) => {
    setNotice(null);
    const result = await provisionLocalModel({ allowMetered });
    if (!result.started) setNotice(result.reason === 'network_unavailable' ? 'Connect to the internet to continue the one-time AI setup.' : 'Wi-Fi is preferred. Approve mobile data below only if you want to use about 1.19 GB.');
  }, []);

  useEffect(() => {
    if (automaticAttempted.current || network !== 'wifi') return;
    if (state.kind === 'not_downloaded' || state.kind === 'paused') { automaticAttempted.current = true; setTimeout(() => { void start(false); }, 0); }
    if (state.kind === 'available') { automaticAttempted.current = true; setTimeout(() => { void localModelManager.load(); }, 0); }
  }, [network, start, state.kind]);

  const progress = state.kind === 'downloading' || state.kind === 'paused' ? state.progress : null;
  const savedBytes = state.kind === 'error' ? state.savedBytes ?? 0 : state.kind === 'not_downloaded' ? state.partialBytes : 0;
  return <Card>
    <AppText variant="meta">PERSONAL AI ENGINE / ON DEVICE</AppText>
    <AppText variant="title">{titleFor(state)}</AppText>
    <AppText>Setting up your personal AI running coach. This is a one-time {formatSize(QWEN_MODEL.byteSize)} download. Once installed, training plans can be generated offline.</AppText>
    <AppText variant="meta">CONNECTION: {network.toUpperCase()}</AppText>
    {progress && <AppText accessibilityLiveRegion="polite">{formatSize(progress.completedBytes)} of {formatSize(progress.totalBytes)} · {Math.floor(progress.fraction * 100)}%</AppText>}
    {savedBytes > 0 && !progress && <AppText>Saved download progress: {formatSize(savedBytes)}.</AppText>}
    {state.kind === 'not_downloaded' && <AppText variant="meta">FREE: {formatSize(state.availableBytes)} · REQUIRED WITH HEADROOM: {formatSize(requiredModelStorageBytes())}</AppText>}
    {state.kind === 'downloading' && <><Button label="Pause download" tone="secondary" onPress={() => { void localModelManager.pauseDownload(); }} /><Button label="Cancel and remove download" tone="secondary" onPress={() => { void localModelManager.cancelDownload(); }} /></>}
    {state.kind === 'paused' && <Button label="Resume download" onPress={() => { void start(network !== 'wifi'); }} />}
    {state.kind === 'error' && state.recoverable && <Button label="Retry" onPress={() => { automaticAttempted.current = true; void start(network !== 'wifi'); }} />}
    {(state.kind === 'not_downloaded' && network !== 'wifi') && <Button label={network === 'cellular' ? 'Use mobile data for setup' : 'Approve this connection for setup'} onPress={() => { automaticAttempted.current = true; void start(true); }} />}
    {state.kind === 'available' && <Button label="Initialize AI" onPress={() => { void localModelManager.load(); }} />}
    {state.kind === 'loading' && <AppText accessibilityLiveRegion="polite">Loading locally · {Math.floor(state.progress * 100)}%</AppText>}
    {state.kind === 'ready' && <AppText>Your AI engine is installed, verified, and ready offline.</AppText>}
    {state.kind === 'error' && <AppText>{state.message}</AppText>}
    {notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    <AppText variant="meta">Onboarding and GPS tracking remain available while setup runs.</AppText>
  </Card>;
}
