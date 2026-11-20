export type TalkingMascotPlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed';
export type TalkingMascotPlayer = { play(): void; pause(): void; seekTo(seconds: number): Promise<void> };

/** Serializes user controls around one Expo Audio player. It owns no native resource. */
export class TalkingMascotPlaybackController {
  private queue: Promise<void> = Promise.resolve(); private disposed = false; private state: TalkingMascotPlaybackState = 'idle';
  constructor(private readonly player: TalkingMascotPlayer, private readonly onState: (state: TalkingMascotPlaybackState) => void) {}
  get currentState(): TalkingMascotPlaybackState { return this.state; }
  play(): Promise<void> { return this.enqueue(async () => { if (this.state === 'playing') return; if (this.state === 'idle' || this.state === 'stopped' || this.state === 'completed') await this.player.seekTo(0); this.player.play(); this.transition('playing'); }); }
  pause(): Promise<void> { return this.enqueue(async () => { if (this.state !== 'playing') return; this.player.pause(); this.transition('paused'); }); }
  resume(): Promise<void> { return this.enqueue(async () => { if (this.state !== 'paused') return; this.player.play(); this.transition('playing'); }); }
  replay(): Promise<void> { return this.enqueue(async () => { this.player.pause(); await this.player.seekTo(0); this.player.play(); this.transition('playing'); }); }
  stop(): Promise<void> { return this.enqueue(() => this.stopInternal()); }
  completed(): Promise<void> { return this.enqueue(async () => { if (this.state === 'completed' || this.state === 'stopped') return; this.player.pause(); await this.player.seekTo(0); this.transition('completed'); }); }
  dispose(): Promise<void> { this.disposed = true; const pending = this.queue.then(() => this.stopInternal()); this.queue = pending.catch(() => undefined); return pending; }
  private enqueue(action: () => Promise<void>): Promise<void> { if (this.disposed) return Promise.resolve(); const pending = this.queue.then(action); this.queue = pending.catch(() => undefined); return pending; }
  private async stopInternal(): Promise<void> { this.player.pause(); await this.player.seekTo(0); this.transition('stopped'); }
  private transition(next: TalkingMascotPlaybackState): void { this.state = next; this.onState(next); }
}
