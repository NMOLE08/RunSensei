import {
  JETT_INTRO_DURATION_SECONDS,
  JETT_MOUTH_CUES,
  JETT_MOUTH_STATES,
  jettMouthCueAt,
  jettMouthStateAt,
} from '@/domain/jettLipSync';

describe('Jett intro lip-sync timing', () => {
  it('contains the validated 115-cue Rhubarb timeline for the full recording', () => {
    expect(JETT_INTRO_DURATION_SECONDS).toBe(22.2);
    expect(JETT_MOUTH_CUES).toHaveLength(115);
    expect(JETT_MOUTH_CUES[0]).toMatchObject({ start: 0 });
    expect(JETT_MOUTH_CUES.at(-1)).toMatchObject({ end: JETT_INTRO_DURATION_SECONDS });

    for (const [index, cue] of JETT_MOUTH_CUES.entries()) {
      expect(JETT_MOUTH_STATES).toContain(cue.value);
      expect(cue.end).toBeGreaterThan(cue.start);
      if (index > 0) expect(cue.start).toBe(JETT_MOUTH_CUES[index - 1]!.end);
    }
  });

  it('looks up the authored state from player time and resets outside the recording', () => {
    for (const cue of JETT_MOUTH_CUES) {
      expect(jettMouthCueAt((cue.start + cue.end) / 2)).toEqual(cue);
      expect(jettMouthStateAt((cue.start + cue.end) / 2)).toBe(cue.value);
    }

    expect(jettMouthCueAt(-0.001)).toBeNull();
    expect(jettMouthCueAt(JETT_INTRO_DURATION_SECONDS)).toBeNull();
    expect(jettMouthStateAt(-0.001)).toBe('X');
    expect(jettMouthStateAt(JETT_INTRO_DURATION_SECONDS)).toBe('X');
  });
});
