import { SystemSpeechCuePlayer } from '@/services/audio/systemSpeechCuePlayer';
import type * as SpeechApi from 'expo-speech';

function setup() {
  let voices: unknown[] = [{ identifier: 'system-voice' }];
  const speak = jest.fn(); const stop = jest.fn(async () => undefined);
  const api = { getAvailableVoicesAsync: async () => voices, speak, stop } as unknown as typeof SpeechApi;
  return { player: new SystemSpeechCuePlayer(async () => api), speak, stop, setVoices: (value: unknown[]) => { voices = value; } };
}

test('device adapter identifies a generic system voice and clears speech queue before a new cue', async () => {
  const { player, speak, stop } = setup();
  expect(await player.availability()).toEqual({ available: true, label: 'Generic system voice' });
  const callbacks = { onStarted: jest.fn(), onCompleted: jest.fn(), onFailed: jest.fn(), onStopped: jest.fn() };
  await player.speak('Warm-up.', callbacks);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(speak).toHaveBeenCalledWith('Warm-up.', expect.objectContaining({ onStart: callbacks.onStarted, onDone: callbacks.onCompleted, onStopped: callbacks.onStopped }));
  const options = speak.mock.calls[0]![1] as { onError: () => void };
  options.onError(); expect(callbacks.onFailed).toHaveBeenCalledWith('system_speech_error');
});

test('device adapter reports unavailable speech and tolerates native stop errors', async () => {
  const { player, stop, setVoices } = setup(); setVoices([]); stop.mockRejectedValueOnce(new Error('native module unavailable'));
  expect(await player.availability()).toMatchObject({ available: false });
  await expect(player.stop()).resolves.toBeUndefined();
});
