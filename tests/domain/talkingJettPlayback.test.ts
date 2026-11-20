import { TalkingJettPlaybackController, type TalkingJettPlaybackState, type TalkingJettPlayer } from '@/domain/talkingJettPlayback';

function createHarness() {
  const calls: string[] = [];
  const states: TalkingJettPlaybackState[] = [];
  const player: TalkingJettPlayer = {
    play: jest.fn(() => { calls.push('play'); }),
    pause: jest.fn(() => { calls.push('pause'); }),
    seekTo: jest.fn(async (seconds: number) => { calls.push(`seek:${seconds}`); }),
  };
  const controller = new TalkingJettPlaybackController(player, (state) => states.push(state));
  return { calls, controller, player, states };
}

describe('Talking Jett playback controller', () => {
  it('serializes rapid play, pause, and resume interactions on one player', async () => {
    const { calls, controller, states } = createHarness();

    await Promise.all([controller.play(), controller.pause(), controller.resume()]);

    expect(controller.currentState).toBe('playing');
    expect(states).toEqual(['playing', 'paused', 'playing']);
    expect(calls).toEqual(['seek:0', 'play', 'pause', 'play']);
  });

  it('replays from the beginning, and stop and completion reset the visual time', async () => {
    const { calls, controller, states } = createHarness();
    await controller.play();
    await controller.replay();
    await controller.completed();

    expect(controller.currentState).toBe('completed');
    expect(states).toEqual(['playing', 'playing', 'completed']);
    expect(calls).toEqual(['seek:0', 'play', 'pause', 'seek:0', 'play', 'pause', 'seek:0']);

    await controller.stop();
    expect(controller.currentState).toBe('stopped');
    expect(calls.slice(-2)).toEqual(['pause', 'seek:0']);
  });

  it('stops on screen exit and ignores later commands, so reopening owns a new controller', async () => {
    const first = createHarness();
    await first.controller.play();
    await first.controller.dispose();
    await first.controller.replay();

    expect(first.controller.currentState).toBe('stopped');
    expect(first.calls).toEqual(['seek:0', 'play', 'pause', 'seek:0']);

    const reopened = createHarness();
    await reopened.controller.play();
    expect(reopened.controller.currentState).toBe('playing');
    expect(reopened.calls).toEqual(['seek:0', 'play']);
  });
});
