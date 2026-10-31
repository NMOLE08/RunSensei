import { LOCAL_SENSEI_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { LOCAL_WEEKLY_PLAN_SCHEMA, parseLocalWeeklyPlan, validateLocalWeeklyPlan, type LocalWeeklyPlan, type LocalWeeklyPlannerInput } from '@/ai/schemas/weeklyPlanSchema';
import { qwenInference, type QwenInferenceService } from './QwenInferenceService';

export class WeeklyPlanGenerator {
  constructor(private readonly inference: Pick<QwenInferenceService, 'structured'> = qwenInference) {}
  async generate(input: LocalWeeklyPlannerInput): Promise<LocalWeeklyPlan> {
    if (!input.policy.reviewed) throw new Error('Reviewed training content is required before local plan generation.');
    const base = `Arrange exactly one week using only the allowed templates. Copy template fields exactly. Input:\n${JSON.stringify(input)}`;
    let failure = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const text = await this.inference.structured({ systemPrompt: LOCAL_SENSEI_SYSTEM_PROMPT, userPrompt: attempt === 0 ? base : `${base}\nYour previous result was rejected: ${failure}. Return a corrected JSON object only.`, schema: LOCAL_WEEKLY_PLAN_SCHEMA, maxTokens: 1800, temperature: 0.1 });
      try { return validateLocalWeeklyPlan(parseLocalWeeklyPlan(text), input); } catch (error) { failure = error instanceof Error ? error.message : 'invalid result'; }
    }
    throw new Error(`The local model could not produce a valid week: ${failure}`);
  }
}
