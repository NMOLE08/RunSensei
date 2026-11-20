import timing from '../../artifacts/jett-lipsync/timing/jett-intro-mouth-cues.json';
import { createMascotLipSyncTimeline, mascotMouthCueAt, mascotMouthStateAt, MASCOT_MOUTH_STATES, type MascotMouthCue, type MascotMouthState } from './mascotLipSync';

export const JETT_MOUTH_STATES = MASCOT_MOUTH_STATES;
export type JettMouthState = MascotMouthState;
export type JettMouthCue = MascotMouthCue;
export const JETT_LIP_SYNC = createMascotLipSyncTimeline(timing, 'jett');
export const JETT_INTRO_DURATION_SECONDS = JETT_LIP_SYNC.durationSeconds;
export const JETT_MOUTH_CUES = JETT_LIP_SYNC.cues;
/** Finds the authored Rhubarb state from actual player time; no independent animation clock is used. */
export const jettMouthCueAt = (positionSeconds: number) => mascotMouthCueAt(JETT_LIP_SYNC, positionSeconds);
export const jettMouthStateAt = (positionSeconds: number) => mascotMouthStateAt(JETT_LIP_SYNC, positionSeconds);
