import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const noticeSource = () => readFileSync(join(__dirname, '../../src/features/execution/PreparedPlanCandidateNotice.tsx'), 'utf8');

describe('prepared calendar notice', () => {
  it('states the health safety hold before the ordinary stale-calendar notice', () => {
    const source = noticeSource();
    expect(source).toContain('healthHold?.active');
    expect(source.indexOf('healthHold?.active')).toBeLessThan(source.indexOf('mismatch?.changed'));
    expect(source).toContain('SAVED CALENDAR · SAFETY HOLD');
    expect(source).toContain('activated, published, or rebuilt');
    expect(source).toContain('No saved workouts in that calendar have been changed');
    expect(source).toContain('do not treat it as cleared for training');
  });

  it('does not offer a refresh promise inside the safety-hold branch', () => {
    const source = noticeSource();
    const holdBranch = source.slice(source.indexOf('if (healthHold?.active)'), source.indexOf('const mismatch'));
    expect(holdBranch).not.toContain('refresh it to rebuild');
    expect(holdBranch).not.toContain('Activate');
    expect(holdBranch).toContain('Finish the health review before asking Torto for a fresh calendar.');
  });
});
