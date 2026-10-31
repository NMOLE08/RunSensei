export type SenseiAction =
  | { type: 'ask_question'; question: string; reasonCode: string }
  | { type: 'propose_revision'; reasonCode: string; explanation: string; changes: { sessionId: string; action: 'move' | 'replace' | 'skip'; targetDate: string | null; templateId: string | null }[] }
  | { type: 'no_change'; reasonCode: string; explanation: string }
  | { type: 'safety_hold'; reasonCode: 'pain_or_injury' | 'illness'; explanation: string };

export const SENSEI_ACTION_SCHEMA = { type: 'object', required: ['type', 'reasonCode'], properties: { type: { type: 'string', enum: ['ask_question', 'propose_revision', 'no_change', 'safety_hold'] }, reasonCode: { type: 'string' }, question: { type: 'string' }, explanation: { type: 'string' }, changes: { type: 'array', items: { type: 'object', required: ['sessionId', 'action', 'targetDate', 'templateId'], properties: { sessionId: { type: 'string' }, action: { type: 'string', enum: ['move', 'replace', 'skip'] }, targetDate: { type: ['string', 'null'] }, templateId: { type: ['string', 'null'] } } } } } } as const;

export function parseSenseiAction(text: string): SenseiAction {
  let value: SenseiAction; try { value = JSON.parse(text) as SenseiAction; } catch { throw new Error('The local assistant returned malformed data.'); }
  if (!value || !['ask_question', 'propose_revision', 'no_change', 'safety_hold'].includes(value.type) || typeof value.reasonCode !== 'string') throw new Error('The local assistant returned an unsupported action.');
  if (value.type === 'ask_question' && !value.question) throw new Error('The local assistant omitted its question.');
  if (value.type === 'propose_revision' && (!value.explanation || !Array.isArray(value.changes))) throw new Error('The local assistant returned an incomplete revision.');
  if ((value.type === 'no_change' || value.type === 'safety_hold') && !value.explanation) throw new Error('The local assistant omitted its explanation.');
  return value;
}
