import type { GuidedVoiceProvider, SpeechCallbacks } from './guidedVoiceProvider';

export class SystemSpeechCuePlayer implements GuidedVoiceProvider {
  readonly id = 'system_tts' as const;
  constructor(private readonly loadSpeech: () => Promise<typeof import('expo-speech')> = () => import('expo-speech')) {}
  async availability() {
    try {
      const Speech = await this.loadSpeech();
      const voices = await Speech.getAvailableVoicesAsync();
      return voices.length ? { available: true, label: 'Generic system voice' } : { available: false, label: 'System speech unavailable' };
    } catch { return { available: false, label: 'System speech unavailable' }; }
  }
  async speak(text: string, callbacks: SpeechCallbacks): Promise<void> {
    await this.stop();
    const Speech = await this.loadSpeech();
    Speech.speak(text, {
      onStart: callbacks.onStarted,
      onDone: callbacks.onCompleted,
      onError: () => callbacks.onFailed?.('system_speech_error'),
      onStopped: callbacks.onStopped,
    });
  }
  async stop(): Promise<void> { try { const Speech = await this.loadSpeech(); await Speech.stop(); } catch { /* Audio must never affect workout control. */ } }
}
