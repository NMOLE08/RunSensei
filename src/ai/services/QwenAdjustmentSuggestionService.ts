import type { SystemBResult } from '@/domain/planning/systemB';

export type QwenAdjustmentSuggestion = { kind: 'suggestion'; explanation: string; requestedChanges: readonly { sessionDate: string; action: 'keep' | 'move' | 'reduce' | 'skip'; reason: string }[] };

/** Qwen may suggest changes after feedback; this service never writes plans or creates prescriptions. */
export function validateQwenAdjustmentSuggestion(value: QwenAdjustmentSuggestion, current: Extract<SystemBResult, { kind: 'plan' }>): QwenAdjustmentSuggestion {
  const dates = new Set(current.sessions.map((item) => item.date));
  if (!value.explanation.trim() || value.requestedChanges.some((item) => !dates.has(item.sessionDate))) throw new Error('Qwen suggestion references an unknown session.');
  return value;
}
