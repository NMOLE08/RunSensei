import { LOCAL_SENSEI_SYSTEM_PROMPT } from '@/ai/prompts/senseiSystemPrompt';
import { parseSenseiAction, SENSEI_ACTION_SCHEMA, type SenseiAction } from '@/ai/schemas/senseiActionSchema';
import { qwenInference, type QwenInferenceService } from './QwenInferenceService';
import { requireDateOnly, weekday } from '@/domain/calendar/operations';

export type AdaptationSession = { sessionId: string; date: string; templateId: string; running: boolean };
export type AdaptationContext = { concern: 'none' | 'pain_or_injury' | 'illness'; userMessage: string; completedSessionIds: string[]; remainingSessions: AdaptationSession[]; allowedTemplateIds: string[]; policyVersion: string | null; availableWeekdays?: number[]; unavailableDates?: string[]; completedRunDates?: string[]; minimumRecoveryDays?: number };

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
      validateRevisionSchedule(action, context);
    }
    return action;
  }
}

function validateRevisionSchedule(action: Extract<SenseiAction, { type: 'propose_revision' }>, context: AdaptationContext): void {
  const sessions = new Map(context.remainingSessions.map((session) => [session.sessionId, { ...session }]));
  for (const change of action.changes) {
    const session = sessions.get(change.sessionId); if (!session) throw new Error('The proposed revision referenced a session outside the remaining week.');
    if (change.action === 'skip') { sessions.delete(change.sessionId); continue; }
    if (change.action === 'move') {
      if (!change.targetDate) throw new Error('A moved workout requires a target date.');
      const targetWeekday = weekday(requireDateOnly(change.targetDate));
      if (context.availableWeekdays && !context.availableWeekdays.includes(targetWeekday) || context.unavailableDates?.includes(change.targetDate)) throw new Error('The proposed workout date is unavailable.');
      session.date = change.targetDate;
    }
    if (change.action === 'replace' && change.templateId) session.templateId = change.templateId;
  }
  const values = [...sessions.values()]; const dates = values.map((session) => session.date);
  if (new Set(dates).size !== dates.length) throw new Error('The proposed revision stacks multiple workouts on one day.');
  const runDates = [...(context.completedRunDates ?? []), ...values.filter((session) => session.running).map((session) => session.date)].sort();
  const required = context.minimumRecoveryDays ?? 0;
  for (let index = 1; index < runDates.length; index += 1) if (calendarDays(runDates[index - 1], runDates[index]) - 1 < required) throw new Error('The proposed revision violates recovery spacing.');
}

function calendarDays(left: string, right: string): number { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000); }
