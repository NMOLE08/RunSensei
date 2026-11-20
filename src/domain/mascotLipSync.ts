export const MASCOT_MOUTH_STATES = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type MascotMouthState = (typeof MASCOT_MOUTH_STATES)[number];
export type MascotMouthCue = Readonly<{ start: number; end: number; value: MascotMouthState }>;
export type MascotLipSyncTimeline = Readonly<{ durationSeconds: number; cues: readonly MascotMouthCue[] }>;
type RawTiming = { metadata?: { duration?: unknown }; mouthCues?: readonly { start?: unknown; end?: unknown; value?: unknown }[] };

function isMouthState(value: unknown): value is MascotMouthState {
  return typeof value === 'string' && (MASCOT_MOUTH_STATES as readonly string[]).includes(value);
}

/** Validates imported Rhubarb data before any UI can consume it. */
export function createMascotLipSyncTimeline(raw: RawTiming, label: string): MascotLipSyncTimeline {
  const duration = raw.metadata?.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) throw new Error(`${label}_invalid_audio_duration`);
  if (!Array.isArray(raw.mouthCues) || raw.mouthCues.length === 0) throw new Error(`${label}_mouth_cues_missing`);
  const cues: MascotMouthCue[] = []; let previousEnd = 0;
  for (const [index, source] of raw.mouthCues.entries()) {
    if (typeof source.start !== 'number' || typeof source.end !== 'number' || !Number.isFinite(source.start) || !Number.isFinite(source.end) || !isMouthState(source.value) || Math.abs(source.start - previousEnd) > 0.001 || source.end <= source.start) throw new Error(`${label}_invalid_mouth_cue_${index}`);
    cues.push(Object.freeze({ start: source.start, end: source.end, value: source.value })); previousEnd = source.end;
  }
  if (Math.abs(previousEnd - duration) > 0.001) throw new Error(`${label}_mouth_cues_do_not_cover_audio`);
  return Object.freeze({ durationSeconds: duration, cues: Object.freeze(cues) });
}

export function mascotMouthCueAt(timeline: MascotLipSyncTimeline, positionSeconds: number): MascotMouthCue | null {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds >= timeline.durationSeconds) return null;
  let low = 0; let high = timeline.cues.length - 1;
  while (low <= high) {
    const index = Math.floor((low + high) / 2); const cue = timeline.cues[index]!;
    if (positionSeconds < cue.start) high = index - 1;
    else if (positionSeconds >= cue.end) low = index + 1;
    else return cue;
  }
  return null;
}

export function mascotMouthStateAt(timeline: MascotLipSyncTimeline, positionSeconds: number): MascotMouthState {
  return mascotMouthCueAt(timeline, positionSeconds)?.value ?? 'X';
}
