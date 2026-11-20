import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { QWEN_MODEL } from '@/ai/modelManifest';
import { localModelManager } from '@/ai/runtime/localModel';
import type { LocalModelState } from '@/ai/runtime/LocalModelManager';
import { LOCAL_SENSEI_SYSTEM_PROMPT, PERSONALIZED_WEEKLY_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { PERSONALIZED_WEEKLY_PLAN_SCHEMA, parsePersonalizedWeeklyPlan } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { removeModelInstallation, saveModelInstallation } from '@/application/localAiState';
import { AppText, Button, Card, Screen } from '@/design/components';
import { AiProvisioningCard } from '@/ai/components/AiProvisioningCard';
import { extractStructuredJsonText } from '@/ai/runtime/structuredJson';

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
const statusCopy = (state: LocalModelState): string => {
  switch (state.kind) {
    case 'checking': return 'Checking local model…';
    case 'not_downloaded': return 'Not downloaded';
    case 'downloading': return `Downloading ${Math.round(state.progress.fraction * 100)}%`;
    case 'paused': return `Paused at ${Math.round(state.progress.fraction * 100)}%`;
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
  const test = async () => { setMessage('Running a small offline test…'); try { const started = Date.now(); const result = await localModelManager.generate({ systemPrompt: LOCAL_SENSEI_SYSTEM_PROMPT, userPrompt: 'Return a readiness object with status ready.', schema: { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: 'string', const: 'ready' } } }, maxTokens: 32, temperature: 0 }); let parsed: { status?: string }; try { parsed = JSON.parse(extractStructuredJsonText(result.text)) as { status?: string }; } catch (error) { throw new Error(`${error instanceof Error ? error.message : 'The response was invalid.'} Diagnostic response start: ${JSON.stringify(result.text.slice(0, 180))}`); } setMessage(parsed.status === 'ready' ? `Offline test passed in ${((Date.now() - started) / 1000).toFixed(1)} seconds. Prompt ${result.promptTokens ?? '—'} tokens / ${result.promptMs ?? '—'} ms; generated ${result.generatedTokens ?? '—'} tokens / ${result.predictedMs ?? '—'} ms.` : 'The model loaded, but its structured test response was invalid.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'The offline test failed.'); } };
  const testWeek = async () => { setMessage('Running the seven-day structured JSON diagnostic…'); try { const started = Date.now(); const result = await localModelManager.generate({ systemPrompt: PERSONALIZED_WEEKLY_SYSTEM_PROMPT, userPrompt: 'DIAGNOSTIC ONLY, NOT TRAINING ADVICE. Return exactly seven all-rest days from 2026-11-02 through 2026-11-08; weekNumber 1. Keep JSON compact: goalSummary "diagnostic", assumptions [], safetyNotes [], and every day purpose/coachingExplanation "rest", policyRuleId/effortCue/paceTargetSecondsPerKm null, totalDurationMinutes/totalDistanceMeters 0, steps [].', schema: PERSONALIZED_WEEKLY_PLAN_SCHEMA, maxTokens: 1800, temperature: 0 }); const parsed = parsePersonalizedWeeklyPlan(extractStructuredJsonText(result.text)); const consecutive = parsed.days.length === 7 && parsed.days[0]?.date === '2026-11-02' && parsed.days[6]?.date === '2026-11-08'; setMessage(consecutive ? `Seven-day JSON diagnostic passed in ${((Date.now() - started) / 1000).toFixed(1)} seconds. Generated ${result.generatedTokens ?? '—'} tokens in ${result.predictedMs ?? '—'} ms. This did not create or save a workout plan.` : 'The model returned JSON, but it did not contain the requested seven-day diagnostic window.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'The seven-day diagnostic failed.'); } };
  const remove = () => Alert.alert('Remove local model?', 'This frees the downloaded model storage. Your runs and plans are not deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { void localModelManager.remove().then(removeModelInstallation).then(() => setMessage('Local model removed.')).catch((error) => setMessage(error instanceof Error ? error.message : 'The model could not be removed.')); } }]);
  return <Screen>
    <AppText variant="meta">RUN SENSEI / ON-DEVICE</AppText><AppText variant="title">Offline AI model</AppText>
    <AiProvisioningCard />
    <Card><AppText variant="title">{QWEN_MODEL.displayName}</AppText><AppText>{QWEN_MODEL.quantization} · {formatSize(QWEN_MODEL.byteSize)} · {QWEN_MODEL.license}</AppText><AppText>The pinned model is checked against a fixed SHA-256 before it is promoted from temporary storage. Your GPS tracker remains independent.</AppText><AppText variant="meta">STATUS: {statusCopy(state)}</AppText>
      {state.kind === 'ready' && <><AppText variant="meta">BACKEND: {state.gpu ? 'GPU' : 'CPU'} · {state.description}</AppText><Button label="Run offline model test" onPress={() => { void test(); }} /><Button label="Run seven-day JSON diagnostic" onPress={() => { void testWeek(); }} tone="secondary" /><Button label="Remove downloaded model" tone="secondary" onPress={remove} /></>}
    </Card>
    {message && <Card><AppText accessibilityLiveRegion="polite">{message}</AppText></Card>}
    <Card><AppText variant="title">Current limits</AppText><AppText>This runtime is experimental and Android-first. Initial plans are generated by deterministic System B rules. After workout feedback, Qwen may offer a non-binding suggestion for review. The model cannot change your database directly.</AppText></Card>
  </Screen>;
}
