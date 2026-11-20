import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { CoachIntroductionCoordinator, type CoachId, type CoachIntroductionSnapshot } from '@/domain/coachSelection';
import { coachDefinitions } from './mascotAssets';

const STATUS_INTERVAL_MS = 50;
export function useCoachIntroduction(onCompleted: (coachId: CoachId) => void) {
  const player = useAudioPlayer(null, { downloadFirst: true, updateInterval: STATUS_INTERVAL_MS }); const nativeStatus = useAudioPlayerStatus(player);
  const [snapshot, setSnapshot] = useState<CoachIntroductionSnapshot>({ coachId: null, status: 'idle' }); const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(onCompleted);
  const [coordinator] = useState(() => new CoachIntroductionCoordinator<AudioSource>(player, setSnapshot));
  useEffect(() => { completedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => { void setAudioModeAsync({ interruptionMode: 'duckOthers', playsInSilentMode: true, shouldPlayInBackground: false }).catch((cause) => setError(message(cause))); }, []);
  useEffect(() => { if (nativeStatus.didJustFinish && snapshot.coachId && snapshot.status === 'playing') { const coachId = snapshot.coachId; void coordinator.complete(coachId).then(() => completedRef.current(coachId)).catch((cause) => setError(message(cause))); } }, [coordinator, nativeStatus.didJustFinish, snapshot]);
  useEffect(() => {
    if (snapshot.status !== 'playing' || !snapshot.coachId) return;
    const state = nativeStatus.playbackState.toLowerCase();
    if (state.includes('error') || state.includes('failed')) {
      const coachId = snapshot.coachId;
      void Promise.resolve().then(() => {
        setError('This introduction could not be played. You can skip it and continue.');
        return coordinator.fail(coachId);
      });
    }
  }, [coordinator, nativeStatus.playbackState, snapshot]);
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void coordinator.stop().catch(() => undefined); }); return () => subscription.remove(); }, [coordinator]);
  useEffect(() => () => { void coordinator.dispose().catch(() => undefined); }, [coordinator]);
  const play = useCallback((coachId: CoachId) => { setError(null); return coordinator.play(coachId, coachDefinitions[coachId].audio).catch((cause) => { setError(message(cause)); void coordinator.fail(coachId); }); }, [coordinator]);
  const stop = useCallback(() => coordinator.stop().catch((cause) => setError(message(cause))), [coordinator]);
  return { snapshot, nativeStatus, error, play, stop, clearError: () => setError(null) };
}
function message(cause: unknown) { return cause instanceof Error ? `Introduction audio failed: ${cause.message}` : 'Introduction audio failed. You can skip it and continue.'; }
