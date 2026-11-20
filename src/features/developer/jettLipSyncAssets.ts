import type { ImageSourcePropType } from 'react-native';
import type { AudioSource } from 'expo-audio';
import type { JettMouthState } from '@/domain/jettLipSync';

/** Static requires ensure Metro bundles every frame and the local MP3. */
export const jettFrameAssets: Record<JettMouthState, ImageSourcePropType> = {
  X: require('../../../artifacts/jett-lipsync/frames/mouth-X.png'),
  A: require('../../../artifacts/jett-lipsync/frames/mouth-A.png'),
  B: require('../../../artifacts/jett-lipsync/frames/mouth-B.png'),
  C: require('../../../artifacts/jett-lipsync/frames/mouth-C.png'),
  D: require('../../../artifacts/jett-lipsync/frames/mouth-D.png'),
  E: require('../../../artifacts/jett-lipsync/frames/mouth-E.png'),
  F: require('../../../artifacts/jett-lipsync/frames/mouth-F.png'),
  G: require('../../../artifacts/jett-lipsync/frames/mouth-G.png'),
};

export const jettIntroAudio: AudioSource = require('../../../artifacts/jett-lipsync/audio/jett-intro.mp3');
