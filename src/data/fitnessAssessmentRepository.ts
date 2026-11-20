import type { SqlDatabase } from './database';
import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';

export class FitnessAssessmentRepository {
  constructor(private readonly database: SqlDatabase, private readonly ownerId: string) {}
  async loadDraft(): Promise<FitnessAssessmentDraft | null> { const row = await this.database.getFirst<{ payload_json: string }>('SELECT payload_json FROM fitness_assessment_drafts WHERE owner_id = ?', [this.ownerId]); return row ? JSON.parse(row.payload_json) as FitnessAssessmentDraft : null; }
  async saveDraft(value: FitnessAssessmentDraft): Promise<void> { await this.database.run('INSERT OR REPLACE INTO fitness_assessment_drafts (owner_id,payload_json,updated_at,schema_version) VALUES (?,?,?,?)', [this.ownerId, JSON.stringify(value), value.updatedAt, value.schemaVersion]); }
  /** Re-checking unchanged answers is idempotent; edited answers create a later immutable fact. */
  async saveResult(value: FitnessAssessmentResult, input: FitnessAssessmentDraft): Promise<'created' | 'existing'> {
    const existing = await this.database.getFirst<{ id: string }>('SELECT id FROM fitness_assessments WHERE owner_id = ? AND input_fingerprint = ? LIMIT 1', [this.ownerId, value.inputFingerprint]);
    if (existing) return 'existing';
    const result = await this.database.run('INSERT INTO fitness_assessments (id,owner_id,assessment_version,input_fingerprint,input_json,result_json,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_id,input_fingerprint) DO NOTHING', [`assessment:${this.ownerId}:${value.inputFingerprint}`, this.ownerId, value.version, value.inputFingerprint, JSON.stringify(input), JSON.stringify(value), value.createdAt]);
    return result.changes === 1 ? 'created' : 'existing';
  }
  async resultForInputFingerprint(inputFingerprint: string): Promise<FitnessAssessmentResult | null> {
    const row = await this.database.getFirst<{ result_json: string }>('SELECT result_json FROM fitness_assessments WHERE owner_id = ? AND input_fingerprint = ? LIMIT 1', [this.ownerId, inputFingerprint]);
    return row ? JSON.parse(row.result_json) as FitnessAssessmentResult : null;
  }
  async latestResult(): Promise<FitnessAssessmentResult | null> { const row = await this.database.getFirst<{ result_json: string }>('SELECT result_json FROM fitness_assessments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1', [this.ownerId]); return row ? JSON.parse(row.result_json) as FitnessAssessmentResult : null; }
}
