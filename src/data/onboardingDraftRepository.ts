import { emptyBaselineWeeks, emptyDraft, type OnboardingDraft } from '@/domain/onboarding/types';
import type { SqlDatabase } from './database';

const goalEventForDistance = (distance: OnboardingDraft['goalDistance']): OnboardingDraft['goalEvent'] => distance === '5000' ? '5k' : distance === '10000' ? '10k' : distance === '42195' ? 'marathon' : 'half_marathon';

/** Lossless JSON migration. Legacy fields remain present while new semantic fields receive safe defaults. */
export function migrateOnboardingDraft(saved: Partial<OnboardingDraft>, timezone = 'UTC'): OnboardingDraft {
  const fallback = emptyDraft(saved.timezone || timezone);
  const goalDistance = saved.goalDistance ?? fallback.goalDistance;
  const baselineWeeks = Array.isArray(saved.baselineWeeks) && saved.baselineWeeks.length === 4
    ? saved.baselineWeeks.map((week, index) => ({ ...emptyBaselineWeeks()[index], ...week, distance: { ...emptyBaselineWeeks()[index].distance, ...week.distance }, durationMinutes: { ...emptyBaselineWeeks()[index].durationMinutes, ...week.durationMinutes } }))
    : fallback.baselineWeeks;
  return { ...fallback, ...saved, schemaVersion: 3, goalDistance, goalEvent: saved.goalEvent ?? goalEventForDistance(goalDistance), baselineWeeks };
}

export class OnboardingDraftRepository {
  public constructor(private readonly database: SqlDatabase) {}
  async load(): Promise<OnboardingDraft | null> { const row = await this.database.getFirst<{ payload_json: string }>('SELECT payload_json FROM onboarding_drafts WHERE id = ?', ['current']); if (!row) return null; return migrateOnboardingDraft(JSON.parse(row.payload_json) as Partial<OnboardingDraft>); }
  async save(draft: OnboardingDraft): Promise<void> { await this.database.run('INSERT OR REPLACE INTO onboarding_drafts (id, payload_json, updated_at, schema_version) VALUES (?, ?, ?, ?)', [draft.id, JSON.stringify(draft), draft.updatedAt, draft.schemaVersion]); }
}
