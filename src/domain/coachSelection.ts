export type CoachId = 'moss' | 'jett';
export type CoachIntroductionStatus = 'idle' | 'loading' | 'playing' | 'completed' | 'stopped' | 'error';
export type CoachIntroductionSnapshot = Readonly<{ coachId: CoachId | null; status: CoachIntroductionStatus }>;

export function canConfirmCoach(selected: CoachId | null, satisfied: ReadonlySet<CoachId>): selected is CoachId {
  return selected !== null && satisfied.has(selected);
}

export type CoachAudioPlayer<Source> = { pause(): void; play(): void; replace(source: Source): void; seekTo(seconds: number): Promise<void> };

/** One serialized player coordinator prevents overlapping coach introductions. */
export class CoachIntroductionCoordinator<Source> {
  private queue: Promise<void> = Promise.resolve(); private generation = 0; private disposed = false;
  private snapshot: CoachIntroductionSnapshot = { coachId: null, status: 'idle' };
  constructor(private readonly player: CoachAudioPlayer<Source>, private readonly onChange: (snapshot: CoachIntroductionSnapshot) => void) {}
  get current(): CoachIntroductionSnapshot { return this.snapshot; }
  play(coachId: CoachId, source: Source): Promise<void> {
    const generation = ++this.generation; this.emit({ coachId, status: 'loading' });
    return this.enqueue(async () => {
      this.player.pause(); await this.player.seekTo(0);
      if (generation !== this.generation || this.disposed) return;
      this.player.replace(source); this.player.play(); this.emit({ coachId, status: 'playing' });
    });
  }
  complete(coachId: CoachId): Promise<void> {
    return this.enqueue(async () => {
      if (this.snapshot.coachId !== coachId || this.snapshot.status !== 'playing') return;
      this.player.pause(); await this.player.seekTo(0); this.emit({ coachId, status: 'completed' });
    });
  }
  stop(): Promise<void> { ++this.generation; return this.enqueue(async () => { this.player.pause(); await this.player.seekTo(0); this.emit({ coachId: null, status: 'stopped' }); }); }
  fail(coachId: CoachId): Promise<void> { ++this.generation; return this.enqueue(async () => { this.player.pause(); await this.player.seekTo(0); this.emit({ coachId, status: 'error' }); }); }
  dispose(): Promise<void> { this.disposed = true; ++this.generation; const pending = this.queue.then(async () => { this.player.pause(); await this.player.seekTo(0); }); this.queue = pending.catch(() => undefined); return pending; }
  private enqueue(action: () => Promise<void>): Promise<void> { if (this.disposed) return Promise.resolve(); const pending = this.queue.catch(() => undefined).then(action); this.queue = pending.catch(() => undefined); return pending; }
  private emit(snapshot: CoachIntroductionSnapshot) { this.snapshot = snapshot; this.onChange(snapshot); }
}
