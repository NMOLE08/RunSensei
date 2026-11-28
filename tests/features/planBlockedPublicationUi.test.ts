import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const planScreenSource = () => readFileSync(join(__dirname, '../../src/app/(tabs)/plan.tsx'), 'utf8');

describe('blocked 5K publication plan screen', () => {
  it('renders one recovery card instead of a second unavailable StateCard', () => {
    const branch = planScreenSource()
      .split('\n')
      .find((line) => line.includes("goal === '5k' && !publication?.preview && publication"));
    expect(branch).toBeDefined();
    expect(branch).toContain('<PlanAvailabilityCard');
    expect(branch).not.toContain('<StateCard');
    expect(branch).not.toContain('publication.status.message');
  });

  it('continues to render a genuine 5K preview normally', () => {
    const lines = planScreenSource().split('\n');
    const start = lines.findIndex((line) => line.includes("goal === '5k' && publication?.preview"));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(lines.slice(start, start + 5).join('\n')).toContain('<Experimental5kPreviewCard');
  });
});
