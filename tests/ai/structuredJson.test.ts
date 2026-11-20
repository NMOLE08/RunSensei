import { extractStructuredJsonText } from '@/ai/runtime/structuredJson';

describe('extractStructuredJsonText', () => {
  test('accepts a plain object and preserves braces inside strings', () => {
    expect(extractStructuredJsonText('{"message":"keep } and { inside","ready":true}')).toBe('{"message":"keep } and { inside","ready":true}');
  });

  test('removes complete Qwen reasoning blocks', () => {
    expect(extractStructuredJsonText('<think>Reason privately. {not json}</think>\n{"status":"ready"}')).toBe('{"status":"ready"}');
  });

  test('removes the exact Qwen ChatML assistant marker', () => {
    expect(extractStructuredJsonText('<|im_start|>assistant\n{"status":"ready"}')).toBe('{"status":"ready"}');
  });

  test('accepts one JSON Markdown fence', () => {
    expect(extractStructuredJsonText('```json\n[1, {"two":2}]\n```')).toBe('[1, {"two":2}]');
  });

  test.each([
    '<think>unfinished',
    'Here is JSON: {"status":"ready"}',
    '{"status":"ready"} trailing',
    '{"status":',
    '{not-json}',
  ])('rejects incomplete, repaired, or extra content: %s', (value) => {
    expect(() => extractStructuredJsonText(value)).toThrow();
  });
});
