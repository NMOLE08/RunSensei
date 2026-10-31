import { LOCAL_SENSEI_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { parseSenseiAction, SENSEI_ACTION_SCHEMA, type SenseiAction } from '@/ai/schemas/senseiActionSchema';
import { qwenInference, type QwenInferenceService } from './QwenInferenceService';

export type AdaptationContext = { concern: 'none' | 'pain_or_injury' | 'illness'; userMessage: string; completedSessionIds: string[]; remainingSessions: unknown[]; allowedTemplateIds: string[]; policyVersion: string | null };

export class WorkoutAdaptationService {
  constructor(private readonly inference: Pick<QwenInferenceService, 'structured'> = qwenInference) {}
  async propose(context: AdaptationContext): Promise<SenseiAction> {
    if (context.concern !== 'none') return { type: 'safety_hold', reasonCode: context.concern, explanation: 'Training changes are paused because you reported a health concern. Review your current situation before continuing.' };
    if (!context.policyVersion) return { type: 'no_change', reasonCode: 'no_reviewed_policy', explanation: 'No automatic change can be proposed without reviewed training rules.' };
    const text = await this.inference.structured({ systemPrompt: LOCAL_SENSEI_SYSTEM_PROMPT, userPrompt: `Ask at most one relevant question or propose only a structured future change. Never modify these completed session IDs: ${JSON.stringify(context.completedSessionIds)}. Use only allowed template IDs: ${JSON.stringify(context.allowedTemplateIds)}. Context: ${JSON.stringify({ userMessage: context.userMessage, remainingSessions: context.remainingSessions, policyVersion: context.policyVersion })}`, schema: SENSEI_ACTION_SCHEMA, maxTokens: 700, temperature: 0.15 });
    const action = parseSenseiAction(text);
    if (action.type === 'propose_revision') {
      const completed = new Set(context.completedSessionIds); const allowed = new Set(context.allowedTemplateIds);
      if (action.changes.some((change) => completed.has(change.sessionId))) throw new Error('The proposed revision attempted to change a completed workout.');
      if (action.changes.some((change) => change.templateId !== null && !allowed.has(change.templateId))) throw new Error('The proposed revision used an unsupported workout.');
    }
    return action;
  }
}
