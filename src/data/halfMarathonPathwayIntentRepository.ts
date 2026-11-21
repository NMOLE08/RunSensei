import type { SqlDatabase } from './database';
import type { HalfMarathonPathwayChoice, HalfMarathonPathwayIntent } from '@/domain/planning/halfMarathonPathwayIntent';

type Stored = { owner_id: string; goal: 'half_marathon'; choice: HalfMarathonPathwayChoice; schema_version: number; revision: number; updated_at: string };

export class HalfMarathonPathwayIntentRepository {
  public constructor(private readonly database: SqlDatabase, private readonly ownerId: string) { if (!ownerId) throw new Error('pathway_intent_owner_required'); }
  async get(): Promise<HalfMarathonPathwayIntent | null> {
    const row = await this.database.getFirst<Stored>('SELECT owner_id, goal, choice, schema_version, revision, updated_at FROM half_marathon_pathway_intents WHERE owner_id = ? AND goal = ?', [this.ownerId, 'half_marathon']);
    return row ? decode(row) : null;
  }
  async save(choice: HalfMarathonPathwayChoice, updatedAt: string): Promise<HalfMarathonPathwayIntent> {
    const commit = async () => {
      const current = await this.get();
      const next: HalfMarathonPathwayIntent = { ownerId: this.ownerId, goal: 'half_marathon', choice, schemaVersion: 1, revision: (current?.revision ?? 0) + 1, updatedAt };
      await this.database.run('INSERT INTO half_marathon_pathway_intents (owner_id, goal, choice, schema_version, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, goal) DO UPDATE SET choice = excluded.choice, schema_version = excluded.schema_version, revision = excluded.revision, updated_at = excluded.updated_at', [next.ownerId, next.goal, next.choice, next.schemaVersion, next.revision, next.updatedAt]);
      const committed = await this.get();
      if (!committed || committed.revision !== next.revision || committed.choice !== next.choice) throw new Error('pathway_intent_write_not_committed');
      return committed;
    };
    return this.database.exclusiveTransaction ? this.database.exclusiveTransaction(commit) : this.database.transaction(commit);
  }
}

function decode(row: Stored): HalfMarathonPathwayIntent {
  if (row.goal !== 'half_marathon' || (row.choice !== 'foundation' && row.choice !== 'event_preparation') || row.schema_version !== 1 || !Number.isInteger(row.revision) || row.revision < 1) throw new Error('invalid_pathway_intent');
  return { ownerId: row.owner_id, goal: row.goal, choice: row.choice, schemaVersion: 1, revision: row.revision, updatedAt: row.updated_at };
}
