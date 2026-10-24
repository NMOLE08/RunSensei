import { emptyDraft, type OnboardingDraft } from '@/domain/onboarding/types';
import type { SqlDatabase } from './database';

export class OnboardingDraftRepository {
  public constructor(private readonly database: SqlDatabase) {}
  async load(): Promise<OnboardingDraft | null> { const row = await this.database.getFirst<{ payload_json: string }>('SELECT payload_json FROM onboarding_drafts WHERE id = ?', ['current']); if (!row) return null; const saved = JSON.parse(row.payload_json) as Partial<OnboardingDraft>; return { ...emptyDraft(saved.timezone || 'UTC'), ...saved, goalDistance: saved.goalDistance ?? '21097' }; }
  async save(draft: OnboardingDraft): Promise<void> { await this.database.run('INSERT OR REPLACE INTO onboarding_drafts (id, payload_json, updated_at) VALUES (?, ?, ?)', [draft.id, JSON.stringify(draft), draft.updatedAt]); }
}
