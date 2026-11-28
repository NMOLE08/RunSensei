import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hookSource = () => readFileSync(join(__dirname, '../../src/features/execution/usePlanAvailability.ts'), 'utf8');

describe('plan availability hook', () => {
  it('keeps request-id stale protection on success and failure', () => {
    const source = hookSource();
    expect(source).toContain('const id = ++requestId.current;');
    expect(source).toContain("if (requestId.current === id) setState({ status: 'ready', data, error: null });");
    expect(source).toContain("if (requestId.current === id) setState({ status: 'unavailable', data: null, error:");
  });
});
