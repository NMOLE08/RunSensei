import { JETT_LIP_SYNC } from '@/domain/jettLipSync';
import { MOSS_LIP_SYNC } from '@/domain/mossLipSync';
import { MASCOT_MOUTH_STATES, mascotMouthCueAt, mascotMouthStateAt } from '@/domain/mascotLipSync';

describe.each([
  ['Jett', JETT_LIP_SYNC, 115, 22.2],
  ['Moss', MOSS_LIP_SYNC, 97, 19.22],
] as const)('%s lip-sync timeline', (_name, timeline, cueCount, duration) => {
  it('is contiguous, state-safe, and covers the verified recording', () => {
    expect(timeline.durationSeconds).toBe(duration);
    expect(timeline.cues).toHaveLength(cueCount);
    expect(timeline.cues[0]?.start).toBe(0);
    expect(timeline.cues.at(-1)?.end).toBe(duration);
    timeline.cues.forEach((cue, index) => {
      expect(MASCOT_MOUTH_STATES).toContain(cue.value);
      expect(cue.end).toBeGreaterThan(cue.start);
      if (index > 0) expect(cue.start).toBe(timeline.cues[index - 1]!.end);
      const midpoint = (cue.start + cue.end) / 2;
      expect(mascotMouthCueAt(timeline, midpoint)).toEqual(cue);
      expect(mascotMouthStateAt(timeline, midpoint)).toBe(cue.value);
    });
  });
});
