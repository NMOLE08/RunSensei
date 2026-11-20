import { QWEN_MODEL } from '@/ai/modelManifest';
import { LOCAL_SENSEI_PROMPT_VERSION, PERSONALIZED_WEEKLY_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { PERSONALIZED_WEEKLY_PLAN_SCHEMA, parsePersonalizedWeeklyPlan, validatePersonalizedWeeklyPlan, type PersonalizedWeeklyInput, type PersonalizedWeeklyPlan } from '@/ai/schemas/personalizedWeeklyPlanSchema';
import { fingerprint } from '@/domain/context';
import { qwenInference, type QwenInferenceService } from './QwenInferenceService';

export type WeeklyGenerationMetadata = {
  generator: 'qwen3.5-2b'; modelId: string; modelVersion: string; promptVersion: string; policyVersion: string;
  contentStatus: 'draft' | 'reviewed'; generationMode: 'production' | 'development_preview';
  generatedAt: string; runnerProfileFingerprint: string; validation: { passed: true; reasonCodes: string[] };
  promptTokens: number | null; generatedTokens: number | null; promptMs: number | null; predictedMs: number | null;
};
export type PersonalizedWeekPreview = { id: string; plan: PersonalizedWeeklyPlan; metadata: WeeklyGenerationMetadata; rawModelJson: string };

type InferenceProvider = Pick<QwenInferenceService, 'structured'> & { structuredWithMetrics?: (request: Parameters<QwenInferenceService['structured']>[0]) => Promise<{ text: string; promptTokens?: number; generatedTokens?: number; promptMs?: number; predictedMs?: number }> };

export class LocalWeeklyPlanGenerationService {
  constructor(private readonly inference: InferenceProvider = qwenInference, private readonly now: () => string = () => new Date().toISOString()) {}

  async generate(input: PersonalizedWeeklyInput): Promise<PersonalizedWeekPreview> {
    const developmentPreview = input.generationMode === 'development_preview';
    const usableDraft = developmentPreview && input.policy.contentStatus === 'draft';
    if ((!input.policy.reviewed || !input.policy.reviewer || !input.policy.reviewDate) && !usableDraft) throw new Error('Reviewed training policy is required before Qwen can propose a week.');
    if (containsRestrictedProvenance(input.runner) || containsRestrictedProvenance(input.trainingState)) throw new Error('Restricted Strava-origin information cannot be sent to the local model.');
    const request = {
      systemPrompt: PERSONALIZED_WEEKLY_SYSTEM_PROMPT,
      userPrompt: `Construct one personalized seven-day proposal inside every supplied bound. Input:\n${JSON.stringify(input)}`,
      schema: PERSONALIZED_WEEKLY_PLAN_SCHEMA, maxTokens: 2600, temperature: 0.15,
    };
    let lastFailure = ''; let rawModelJson = ''; let metrics: { promptTokens?: number; generatedTokens?: number; promptMs?: number; predictedMs?: number } = {};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentRequest = attempt === 0 ? request : { ...request, userPrompt: `${request.userPrompt}\nThe previous JSON was rejected by deterministic validation: ${lastFailure}. Correct it without exceeding any bound.` };
      try {
        if (this.inference.structuredWithMetrics) { const result = await this.inference.structuredWithMetrics(currentRequest); rawModelJson = result.text; metrics = result; }
        else rawModelJson = await this.inference.structured(currentRequest);
        const plan = validatePersonalizedWeeklyPlan(parsePersonalizedWeeklyPlan(rawModelJson), input);
        const generatedAt = this.now();
        return { id: `ai-week:${fingerprint({ input: input.runnerProfileFingerprint, start: input.weekStartDate, week: input.trainingState.weekNumber, rawModelJson })}`, plan, rawModelJson, metadata: { generator: 'qwen3.5-2b', modelId: QWEN_MODEL.id, modelVersion: QWEN_MODEL.version, promptVersion: LOCAL_SENSEI_PROMPT_VERSION, policyVersion: input.policy.version, contentStatus: usableDraft ? 'draft' : 'reviewed', generationMode: developmentPreview ? 'development_preview' : 'production', generatedAt, runnerProfileFingerprint: input.runnerProfileFingerprint, validation: { passed: true, reasonCodes: [] }, promptTokens: metrics.promptTokens ?? null, generatedTokens: metrics.generatedTokens ?? null, promptMs: metrics.promptMs ?? null, predictedMs: metrics.predictedMs ?? null } };
      } catch (error) { lastFailure = error instanceof Error ? error.message : 'Unknown model or validation failure'; }
    }
    throw new Error(`Qwen did not produce a valid weekly proposal. No deterministic plan was substituted. ${lastFailure}`);
  }
}

function containsRestrictedProvenance(value: unknown): boolean {
  if (value === 'strava_api') return true;
  if (Array.isArray(value)) return value.some(containsRestrictedProvenance);
  if (value && typeof value === 'object') return Object.values(value).some(containsRestrictedProvenance);
  return false;
}
