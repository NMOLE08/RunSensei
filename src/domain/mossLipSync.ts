import timing from '../../artifacts/moss-lipsync/timing/moss-intro-mouth-cues.json';
import { createMascotLipSyncTimeline, mascotMouthCueAt, mascotMouthStateAt, type MascotMouthCue, type MascotMouthState } from './mascotLipSync';

export type MossMouthState = MascotMouthState;
export type MossMouthCue = MascotMouthCue;
export const MOSS_LIP_SYNC = createMascotLipSyncTimeline(timing, 'moss');
export const MOSS_INTRO_DURATION_SECONDS = MOSS_LIP_SYNC.durationSeconds;
export const MOSS_MOUTH_CUES = MOSS_LIP_SYNC.cues;
export const mossMouthCueAt = (positionSeconds: number) => mascotMouthCueAt(MOSS_LIP_SYNC, positionSeconds);
export const mossMouthStateAt = (positionSeconds: number) => mascotMouthStateAt(MOSS_LIP_SYNC, positionSeconds);
