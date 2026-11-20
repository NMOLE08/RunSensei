import type { ImageSourcePropType } from 'react-native';
import type { AudioSource } from 'expo-audio';
import { JETT_LIP_SYNC } from '@/domain/jettLipSync';
import { MOSS_LIP_SYNC } from '@/domain/mossLipSync';
import type { CoachId } from '@/domain/coachSelection';
import { mentorPersonaFor } from '@/domain/mentorPersonas';
import type { MascotLipSyncTimeline, MascotMouthState } from '@/domain/mascotLipSync';

export type CoachDefinition = Readonly<{
  id: CoachId; name: string; title: string; personality: string; focus: string;
  frames: Readonly<Record<MascotMouthState, ImageSourcePropType>>; audio: AudioSource;
  timeline: MascotLipSyncTimeline; frameAspectRatio: number; transcript: null;
}>;

const mossFrames: Record<MascotMouthState, ImageSourcePropType> = {
  X: require('../../../artifacts/moss-lipsync/frames/mouth-X.png'), A: require('../../../artifacts/moss-lipsync/frames/mouth-A.png'), B: require('../../../artifacts/moss-lipsync/frames/mouth-B.png'), C: require('../../../artifacts/moss-lipsync/frames/mouth-C.png'),
  D: require('../../../artifacts/moss-lipsync/frames/mouth-D.png'), E: require('../../../artifacts/moss-lipsync/frames/mouth-E.png'), F: require('../../../artifacts/moss-lipsync/frames/mouth-F.png'), G: require('../../../artifacts/moss-lipsync/frames/mouth-G.png'),
};
const jettFrames: Record<MascotMouthState, ImageSourcePropType> = {
  X: require('../../../artifacts/jett-lipsync/frames/mouth-X.png'), A: require('../../../artifacts/jett-lipsync/frames/mouth-A.png'), B: require('../../../artifacts/jett-lipsync/frames/mouth-B.png'), C: require('../../../artifacts/jett-lipsync/frames/mouth-C.png'),
  D: require('../../../artifacts/jett-lipsync/frames/mouth-D.png'), E: require('../../../artifacts/jett-lipsync/frames/mouth-E.png'), F: require('../../../artifacts/jett-lipsync/frames/mouth-F.png'), G: require('../../../artifacts/jett-lipsync/frames/mouth-G.png'),
};

export const coachDefinitions: Readonly<Record<CoachId, CoachDefinition>> = Object.freeze({
  moss: { id: 'moss', name: mentorPersonaFor('moss').displayName, title: mentorPersonaFor('moss').roleTitle, personality: mentorPersonaFor('moss').introductionDescription, focus: 'Different personalities. The same training decisions.', frames: mossFrames, audio: require('../../../artifacts/moss-lipsync/audio/moss-intro.mp3'), timeline: MOSS_LIP_SYNC, frameAspectRatio: 674 / 736, transcript: null },
  jett: { id: 'jett', name: mentorPersonaFor('jett').displayName, title: mentorPersonaFor('jett').roleTitle, personality: mentorPersonaFor('jett').introductionDescription, focus: 'Different personalities. The same training decisions.', frames: jettFrames, audio: require('../../../artifacts/jett-lipsync/audio/jett-intro.mp3'), timeline: JETT_LIP_SYNC, frameAspectRatio: 512 / 576, transcript: null },
});
