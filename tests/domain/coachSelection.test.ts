import { canConfirmCoach, CoachIntroductionCoordinator, type CoachAudioPlayer } from '@/domain/coachSelection';

function harness() {
  const calls: string[] = [];
  const snapshots: string[] = [];
  const player: CoachAudioPlayer<string> = {
    pause: () => calls.push('pause'),
    play: () => calls.push('play'),
    replace: (source) => calls.push(`replace:${source}`),
    seekTo: async (seconds) => { calls.push(`seek:${seconds}`); },
  };
  const coordinator = new CoachIntroductionCoordinator(player, (snapshot) => snapshots.push(`${snapshot.coachId}:${snapshot.status}`));
  return { calls, coordinator, snapshots };
}

describe('coach selection introduction coordination', () => {
  it('requires a selected coach whose intro completed or was explicitly skipped', () => {
    expect(canConfirmCoach(null, new Set())).toBe(false);
    expect(canConfirmCoach('moss', new Set())).toBe(false);
    expect(canConfirmCoach('moss', new Set(['moss']))).toBe(true);
  });

  it('serializes rapid switching through one player without starting the obsolete introduction', async () => {
    const { calls, coordinator, snapshots } = harness();
    await Promise.all([coordinator.play('moss', 'moss.mp3'), coordinator.play('jett', 'jett.mp3')]);
    expect(coordinator.current).toEqual({ coachId: 'jett', status: 'playing' });
    expect(calls).toEqual(['pause', 'seek:0', 'pause', 'seek:0', 'replace:jett.mp3', 'play']);
    expect(snapshots).toEqual(['moss:loading', 'jett:loading', 'jett:playing']);
  });

  it('completes only the active coach and cleans up on exit', async () => {
    const { calls, coordinator } = harness();
    await coordinator.play('moss', 'moss.mp3');
    await coordinator.complete('jett');
    expect(coordinator.current.status).toBe('playing');
    await coordinator.complete('moss');
    expect(coordinator.current).toEqual({ coachId: 'moss', status: 'completed' });
    await coordinator.dispose();
    expect(calls.slice(-4)).toEqual(['pause', 'seek:0', 'pause', 'seek:0']);
  });
});
