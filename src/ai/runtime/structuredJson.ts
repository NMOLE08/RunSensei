/**
 * Normalizes the small set of wrappers that local chat models can emit around
 * schema-constrained JSON. The JSON itself is never repaired or completed.
 */
export function extractStructuredJsonText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim();

  // Some Qwen/llama.cpp combinations still emit an empty or populated thinking
  // block even when thinking is disabled. Only complete leading blocks are
  // accepted so an interrupted generation remains an error.
  while (/^<think>/i.test(text)) {
    const closing = text.search(/<\/think>/i);
    if (closing < 0) throw new Error('The local model returned an incomplete reasoning block.');
    text = text.slice(closing).replace(/^<\/think>/i, '').trim();
  }

  // llama.cpp can return the ChatML assistant turn marker as part of its text
  // even though messages were passed through the native chat API. It is a
  // protocol marker, not user-visible prose, so accept this exact prefix only.
  text = text.replace(/^<\|im_start\|>assistant\s*/i, '');

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();

  if (text[0] !== '{' && text[0] !== '[') {
    throw new Error('The local model did not return a JSON object or array.');
  }

  const opening = text[0];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) { end = index + 1; break; }
      if (depth < 0) break;
    }
  }

  if (end < 0 || inString) throw new Error('The local model returned incomplete JSON.');
  if (text.slice(end).trim().length > 0) throw new Error('The local model returned extra content after its JSON response.');

  const json = text.slice(0, end);
  try { JSON.parse(json); } catch { throw new Error('The local model returned malformed JSON.'); }
  return json;
}
