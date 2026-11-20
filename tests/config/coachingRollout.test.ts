import { coachingRollout, coachingRolloutDescription, coachingRolloutEntry } from '@/config/coachingRollout';

describe('coaching rollout presentation', () => {
  it('keeps the approved distance rollout order', () => {
    expect(coachingRollout.map((entry) => entry.goal)).toEqual(['5k', '10k', 'half_marathon', 'marathon']);
    expect(coachingRollout.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
  });

  it('has no rollout message for the existing habit goal', () => {
    expect(coachingRolloutEntry('habit')).toBeNull();
    expect(coachingRolloutDescription('habit')).toBeNull();
  });

  it('describes later goal paths without claiming activation', () => {
    expect(coachingRolloutDescription('10k')).toContain('planned');
    expect(coachingRolloutDescription('half_marathon')).toContain('research-only');
    expect(coachingRolloutDescription('marathon')).toContain('not available for activation');
  });
});
