import type { SqlDatabase } from './database';

export type GuidedCuePreferences = { voiceEnabled: boolean; muted: boolean; countdownEnabled: boolean };
export const DEFAULT_GUIDED_CUE_PREFERENCES: GuidedCuePreferences = { voiceEnabled: false, muted: false, countdownEnabled: false };
type Stored = { owner_id: string; voice_enabled: number; muted: number; countdown_enabled: number; updated_at: string };

export class GuidedCuePreferencesRepository {
  constructor(private readonly db: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('guided_cue_owner_required'); }
  async get(): Promise<GuidedCuePreferences> {
    const row = await this.db.getFirst<Stored>('SELECT owner_id, voice_enabled, muted, countdown_enabled, updated_at FROM guided_cue_preferences WHERE owner_id = ?', [this.ownerId]);
    return row ? { voiceEnabled: row.voice_enabled === 1, muted: row.muted === 1, countdownEnabled: row.countdown_enabled === 1 } : { ...DEFAULT_GUIDED_CUE_PREFERENCES };
  }
  async save(value: GuidedCuePreferences, updatedAt: string): Promise<GuidedCuePreferences> {
    await this.db.run('INSERT INTO guided_cue_preferences (owner_id, voice_enabled, muted, countdown_enabled, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET voice_enabled = excluded.voice_enabled, muted = excluded.muted, countdown_enabled = excluded.countdown_enabled, updated_at = excluded.updated_at', [this.ownerId, value.voiceEnabled ? 1 : 0, value.muted ? 1 : 0, value.countdownEnabled ? 1 : 0, updatedAt]);
    return { ...value };
  }
}
