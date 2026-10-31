import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { QWEN_MODEL, requiredModelStorageBytes } from '@/ai/modelManifest';
import { localModelManager } from '@/ai/runtime/localModel';
import type { LocalModelState } from '@/ai/runtime/LocalModelManager';
import { LOCAL_SENSEI_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { removeModelInstallation, saveModelInstallation } from '@/application/localAiState';
import { AppText, Button, Card, Screen } from '@/design/components';

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
const statusCopy = (state: LocalModelState): string => {
  switch (state.kind) {
    case 'checking': return 'Checking local model…';
    case 'not_downloaded': return 'Not downloaded';
    case 'downloading': return `Downloading ${Math.round(state.progress.fraction * 100)}%`;
    case 'verifying': return 'Verifying SHA-256 integrity…';
    case 'available': return 'Downloaded and verified';
    case 'loading': return `Loading model ${Math.round(state.progress * 100)}%`;
    case 'ready': return 'Ready for offline inference';
    case 'unsupported': return state.message;
    case 'error': return state.message;
  }
};

export default function LocalModelScreen() {
  const [state, setState] = useState(localModelManager.getState()); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => localModelManager.subscribe(setState), []);
  useEffect(() => { void localModelManager.inspect(); }, []);
  useEffect(() => {
    if (state.kind === 'available' || state.kind === 'ready') void saveModelInstallation('verified', state.path, new Date().toISOString()).catch(() => undefined);
    if (state.kind === 'error') void saveModelInstallation(state.code, null, null).catch(() => undefined);
  }, [state]);
  const download = async () => { setMessage(null); await localModelManager.download(); };
  const load = async () => { setMessage(null); await localModelManager.load(); };
  const test = async () => { setMessage('Running a small offline test…'); try { const result = await localModelManager.generate({ systemPrompt: LOCAL_SENSEI_SYSTEM_PROMPT, userPrompt: 'Return a readiness object with status ready.', schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', const: 'ready' } } }, maxTokens: 32, temperature: 0 }); const parsed = JSON.parse(result.text) as { status?: string }; setMessage(parsed.status === 'ready' ? `Offline test passed. ${result.generatedTokens ?? 'Unknown'} tokens generated.` : 'The model loaded, but its structured test response was invalid.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'The offline test failed.'); } };
  const remove = () => Alert.alert('Remove local model?', 'This frees the downloaded model storage. Your runs and plans are not deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void localModelManager.remove().then(removeModelInstallation).then(() => setMessage('Local model removed.')).catch((error) => setMessage(error instanceof Error ? error.message : 'The model could not be removed.')); } }]);
  return <Screen>
    <AppText variant="meta">RUN SENSEI / ON-DEVICE</AppText><AppText variant="title">Offline AI model</AppText>
    <Card><AppText variant="title">{QWEN_MODEL.displayName}</AppText><AppText>{QWEN_MODEL.quantization} · {formatSize(QWEN_MODEL.byteSize)} · {QWEN_MODEL.license}</AppText><AppText>The model is optional. It is downloaded from the pinned approved source and checked against a fixed SHA-256 before loading. Your GPS tracker does not need it.</AppText><AppText variant="meta">STATUS: {statusCopy(state)}</AppText>
      {state.kind === 'not_downloaded' && <><AppText variant="meta">FREE STORAGE: {formatSize(state.availableBytes)} · REQUIRED WITH HEADROOM: {formatSize(requiredModelStorageBytes())}</AppText><Button label="Download local model" onPress={() => { void download(); }} /></>}
      {state.kind === 'downloading' && <><AppText>{formatSize(state.progress.completedBytes)} of {formatSize(state.progress.totalBytes)}</AppText><Button label="Cancel download" tone="secondary" onPress={() => { void localModelManager.cancelDownload(); }} /></>}
      {(state.kind === 'available' || state.kind === 'error') && <Button label={state.kind === 'available' ? 'Load model' : 'Try again'} onPress={() => { void (state.kind === 'available' ? load() : localModelManager.inspect()); }} />}
      {state.kind === 'ready' && <><AppText variant="meta">BACKEND: {state.gpu ? 'GPU' : 'CPU'} · {state.description}</AppText><Button label="Run offline model test" onPress={() => { void test(); }} /><Button label="Remove downloaded model" tone="secondary" onPress={remove} /></>}
    </Card>
    {message && <Card><AppText accessibilityLiveRegion="polite">{message}</AppText></Card>}
    <Card><AppText variant="title">Current limits</AppText><AppText>This runtime is experimental and Android-first. Plan suggestions remain blocked unless reviewed workout templates and policy are available. The model cannot change your database directly.</AppText></Card>
  </Screen>;
}
