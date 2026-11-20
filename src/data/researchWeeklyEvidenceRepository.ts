import type { SqlDatabase } from './database';
import type { WeekCoverage } from '@/domain/planning/beginner5kRunnerEvidence';

export type WeeklyCoverageState = WeekCoverage['coverage'] | 'partial' | 'unknown';
export type WeeklyEvidenceConfirmation = Omit<WeekCoverage,'coverage'|'episodeId'> & { coverage: WeeklyCoverageState; episodeId: string | null; confirmedAt: string; revision: number; observationEnd: string };
export const CURRENT_TRAINING_EPISODE_ID = 'current-training-episode';
export type TrainingEpisodeReference = { id: string; ownerId: string; status: 'current' | 'historical' | 'unknown'; startedOn: string | null; interruptionDate: string | null; reason: string | null; timezone: string; revision: number };
type Row = { week_start: string; timezone: string; coverage: WeeklyCoverageState; confirmation_date: string; episode_id: string | null; revision: number; payload_json: string };
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> { const result = writeQueue.then(operation); writeQueue = result.catch(() => undefined); return result; }

/** Immutable owner-scoped revisions; latest unknown revision withdraws the active declaration. */
export class ResearchWeeklyEvidenceRepository {
  constructor(private readonly db: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('research_owner_required'); }
  async weeks(): Promise<WeeklyEvidenceConfirmation[]> {
    const rows = await this.db.getAll<Pick<Row,'payload_json'>>('SELECT payload_json FROM research_weekly_evidence WHERE owner_id = ? ORDER BY week_start, revision', [this.ownerId]);
    const latest = new Map<string,WeeklyEvidenceConfirmation>();
    for (const row of rows) { const value = JSON.parse(row.payload_json) as WeeklyEvidenceConfirmation; const old = latest.get(value.weekStart); if (!old || value.revision > old.revision) latest.set(value.weekStart,value); }
    return [...latest.values()].sort((a,b) => a.weekStart.localeCompare(b.weekStart));
  }
  async weekHistory(weekStart: string): Promise<WeeklyEvidenceConfirmation[]> { const rows = await this.db.getAll<{payload_json:string}>('SELECT payload_json FROM research_weekly_evidence WHERE owner_id = ? ORDER BY week_start, revision',[this.ownerId]); return rows.map(row => JSON.parse(row.payload_json) as WeeklyEvidenceConfirmation).filter(value => value.weekStart === weekStart).sort((a,b)=>a.revision-b.revision); }
  async save(value: Omit<WeeklyEvidenceConfirmation, 'revision'>, expectedRevision?: number): Promise<WeeklyEvidenceConfirmation> {
    if (value.ownerId !== this.ownerId) throw new Error('research_owner_mismatch');
    if (!value.weekStart || !value.timezone || !value.sourceId.trim() || !value.confirmedAt || !value.observationEnd) throw new Error('weekly_confirmation_fields_required');
    if (!['complete','confirmed_no_running','partial','unknown'].includes(value.coverage)) throw new Error('invalid_weekly_coverage');
    return serialized(() => this.db.transaction(async () => {
      const old = (await this.weeks()).find(item => item.weekStart === value.weekStart);
      if (expectedRevision !== undefined && (old?.revision ?? 0) !== expectedRevision) throw new Error('stale_weekly_evidence_revision');
      const next: WeeklyEvidenceConfirmation = { ...value, revision: (old?.revision ?? 0) + 1 };
      await this.db.run('INSERT INTO research_weekly_evidence (owner_id,week_start,timezone,coverage,confirmation_date,episode_id,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)', [this.ownerId,next.weekStart,next.timezone,next.coverage,next.confirmedAt,next.episodeId,next.revision,JSON.stringify(next)]);
      return next;
    }));
  }
  async episodes(): Promise<TrainingEpisodeReference[]> {
    const rows = await this.db.getAll<{ payload_json: string }>('SELECT payload_json FROM research_training_episodes WHERE owner_id = ? ORDER BY id,revision', [this.ownerId]);
    const latest = new Map<string,TrainingEpisodeReference>();
    for (const row of rows) { const value=JSON.parse(row.payload_json) as TrainingEpisodeReference; const old=latest.get(value.id); if (!old || value.revision>old.revision) latest.set(value.id,value); }
    return [...latest.values()];
  }
  async episode(): Promise<TrainingEpisodeReference | null> { const values=await this.episodes(); return values.find(item=>item.id===CURRENT_TRAINING_EPISODE_ID) ?? values.find(item => item.status === 'current') ?? null; }
  async saveEpisode(value: Omit<TrainingEpisodeReference,'revision'>, expectedRevision?: number): Promise<TrainingEpisodeReference> {
    if (value.ownerId !== this.ownerId) throw new Error('research_owner_mismatch');
    if (value.id!==CURRENT_TRAINING_EPISODE_ID || !value.timezone || !['current','unknown'].includes(value.status) || (value.status==='current'&&!value.startedOn) || (value.status==='unknown'&&value.startedOn!==null)) throw new Error('invalid_training_episode');
    return serialized(()=>this.db.transaction(async()=>{
      const old = (await this.episodes()).find(item => item.id === value.id);
      if (expectedRevision !== undefined && (old?.revision ?? 0) !== expectedRevision) throw new Error('stale_episode_revision');
      const next = { ...value, revision:(old?.revision ?? 0)+1 };
      await this.db.run('INSERT INTO research_training_episodes (owner_id,id,status,started_on,interruption_date,reason,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)',[this.ownerId,next.id,next.status,next.startedOn,next.interruptionDate,next.reason,next.revision,JSON.stringify(next)]);
      return next;
    }));
  }
}
