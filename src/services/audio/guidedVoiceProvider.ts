export type VoiceProviderId = 'system_tts' | 'moss' | 'jett';
export type SpeechCallbacks = { onStarted?: () => void; onCompleted?: () => void; onFailed?: (code: string) => void; onStopped?: () => void };

/** Moss and Jett are reserved identities; V1 implements only device system TTS. */
export interface GuidedVoiceProvider {
  readonly id: VoiceProviderId;
  availability(): Promise<{ available: boolean; label: string }>;
  speak(text: string, callbacks: SpeechCallbacks): Promise<void>;
  stop(): Promise<void>;
}
