import type { SqlDatabase } from './database';
import {
  assertPreparedPlanCandidateProvenance,
  assertPreparedPlanCandidateSelection,
  isPreparedPlanCandidateLifecycle,
  isPreparedPlanGoalFamily,
  preparedPlanCandidateIdentityKey,
  type PreparedPlanCandidate,
  type PreparedPlanCandidateProvenance,
  type PreparedPlanCandidateSelection,
} from '@/domain/planning/preparedPlanCandidate';

type StoredRow = {
  id: string;
  owner_id: string;
  goal_family: string;
  objective: string;
  pathway: string;
  identity_key: string;
  source_evidence_fingerprint: string;
  generated_on: string;
  lifecycle_state: string;
  payload_json: string;
  created_at: string;
  superseded_at: string | null;
  /** Test SQLite stand-ins alias SELECT columns; production rows stay snake_case. */
  createdAt?: string;
  supersededAt?: string | null;
};

export type SavePreparedPlanCandidateInput<TPayload> = Readonly<{
  id: string;
  selection: PreparedPlanCandidateSelection;
  provenance: PreparedPlanCandidateProvenance;
  payload: TPayload;
  createdAt: string;
  /** Explicit regeneration must write a new row even when nothing changed. */
  force?: boolean;
}>;

// Serializes writers sharing a SQLite connection. The partial unique index in
// migration 29 protects separate connections/processes from two prepared rows.
const preparedCandidateQueues = new WeakMap<SqlDatabase, Promise<unknown>>();

export class PreparedPlanCandidateRepository<TPayload = unknown> {
  public constructor(private readonly database: SqlDatabase, private readonly ownerId: string) {
    if (!ownerId) throw new Error('prepared_candidate_owner_required');
  }

  async findCurrent(selection: PreparedPlanCandidateSelection): Promise<PreparedPlanCandidate<TPayload> | null> {
    return this.findCurrentOn(this.database, selection);
  }

  async list(): Promise<PreparedPlanCandidate<TPayload>[]> {
    const rows = await this.database.getAll<StoredRow>('SELECT id, owner_id, goal_family, objective, pathway, identity_key, source_evidence_fingerprint, generated_on, lifecycle_state, payload_json, created_at, superseded_at FROM prepared_plan_candidates WHERE owner_id = ? ORDER BY created_at, id', [this.ownerId]);
    return rows.map((row) => decode<TPayload>(row));
  }

  async save(input: SavePreparedPlanCandidateInput<TPayload>): Promise<PreparedPlanCandidate<TPayload>> {
    assertPreparedPlanCandidateSelection(input.selection);
    assertPreparedPlanCandidateProvenance(input.provenance);
    if (input.provenance.goalFamily !== input.selection.goalFamily
      || input.provenance.objective !== input.selection.objective
      || input.provenance.pathway !== input.selection.pathway) throw new Error('prepared_candidate_selection_mismatch');
    if (!input.id.trim()) throw new Error('prepared_candidate_id_required');
    if (!input.createdAt.trim()) throw new Error('prepared_candidate_created_at_required');
    const candidatePayloadJson = JSON.stringify(input.payload);
    if (candidatePayloadJson === undefined) throw new Error('prepared_candidate_payload_invalid');
    const payloadJson = JSON.stringify({ provenance: input.provenance, candidatePayload: input.payload });
    const identityKey = preparedPlanCandidateIdentityKey(input.selection);
    const operation = async (database: SqlDatabase) => {
      const repository = new PreparedPlanCandidateRepository<TPayload>(database, this.ownerId);
      const current = await repository.findCurrentOn(database, input.selection);
      if (!input.force
        && current
        && current.provenance.sourceEvidenceFingerprint === input.provenance.sourceEvidenceFingerprint
        && JSON.stringify(current.payload) === candidatePayloadJson) return current;
      if (current) {
        // A delayed request must never replace a calendar prepared later.
        if (input.createdAt < current.createdAt) throw new Error('prepared_candidate_stale');
        if (input.createdAt === current.createdAt) throw new Error('prepared_candidate_conflict');
        const superseded = await database.run('UPDATE prepared_plan_candidates SET lifecycle_state = ?, superseded_at = ? WHERE id = ? AND owner_id = ? AND lifecycle_state = ?', ['superseded', input.createdAt, current.id, this.ownerId, 'prepared']);
        if (superseded.changes !== 1) throw new Error('prepared_candidate_supersede_conflict');
      }
      await database.run('INSERT INTO prepared_plan_candidates (id, owner_id, goal_family, objective, pathway, identity_key, source_evidence_fingerprint, generated_on, lifecycle_state, payload_json, created_at, superseded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        input.id,
        this.ownerId,
        input.selection.goalFamily,
        input.selection.objective,
        input.selection.pathway,
        identityKey,
        input.provenance.sourceEvidenceFingerprint,
        input.provenance.generatedOn,
        'prepared',
        payloadJson,
        input.createdAt,
        null,
      ]);
      const saved = await repository.findCurrentOn(database, input.selection);
      if (!saved
        || saved.id !== input.id
        || saved.provenance.sourceEvidenceFingerprint !== input.provenance.sourceEvidenceFingerprint
        || JSON.stringify(saved.payload) !== candidatePayloadJson) throw new Error('prepared_candidate_write_not_committed');
      return saved;
    };
    const previous = preparedCandidateQueues.get(this.database) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(() => this.database.exclusiveTransaction
      ? this.database.exclusiveTransaction(operation)
      : this.database.transaction(() => operation(this.database)));
    preparedCandidateQueues.set(this.database, pending);
    try { return await pending; } finally { if (preparedCandidateQueues.get(this.database) === pending) preparedCandidateQueues.delete(this.database); }
  }

  private async findCurrentOn(database: SqlDatabase, selection: PreparedPlanCandidateSelection): Promise<PreparedPlanCandidate<TPayload> | null> {
    assertPreparedPlanCandidateSelection(selection);
    const identityKey = preparedPlanCandidateIdentityKey(selection);
    const row = await database.getFirst<StoredRow>('SELECT id, owner_id, goal_family, objective, pathway, identity_key, source_evidence_fingerprint, generated_on, lifecycle_state, payload_json, created_at, superseded_at FROM prepared_plan_candidates WHERE owner_id = ? AND identity_key = ? AND lifecycle_state = ? ORDER BY created_at DESC LIMIT 1', [this.ownerId, identityKey, 'prepared']);
    return row ? decode<TPayload>(row) : null;
  }
}

function decode<TPayload>(row: StoredRow): PreparedPlanCandidate<TPayload> {
  if (!isPreparedPlanGoalFamily(row.goal_family)) throw new Error('invalid_prepared_candidate_goal_family');
  if (!isPreparedPlanCandidateLifecycle(row.lifecycle_state)) throw new Error('invalid_prepared_candidate_lifecycle');
  const selection: PreparedPlanCandidateSelection = { goalFamily: row.goal_family, objective: row.objective, pathway: row.pathway };
  assertPreparedPlanCandidateSelection(selection);
  const identityKey = preparedPlanCandidateIdentityKey(selection);
  if (row.identity_key !== identityKey) throw new Error('invalid_prepared_candidate_identity');
  const provenance: PreparedPlanCandidateProvenance = {
    goalFamily: row.goal_family,
    objective: row.objective,
    pathway: row.pathway,
    policyId: '',
    policyVersion: '',
    sourceEvidenceFingerprint: row.source_evidence_fingerprint,
    generatedOn: row.generated_on,
    startDate: null,
    eventDate: null,
    pathwayIntentRevision: null,
    researchOnly: true,
    productionEligible: false,
    publicationAuthorized: false,
  };
  let payload: TPayload;
  try { payload = JSON.parse(row.payload_json) as TPayload; }
  catch { throw new Error('invalid_prepared_candidate_payload'); }
  const storedProvenance = isRecord(payload) && isRecord(payload.provenance) ? payload.provenance : null;
  const decodedProvenance = storedProvenance ? provenanceFromPayload(storedProvenance, provenance) : provenance;
  assertPreparedPlanCandidateProvenance(decodedProvenance);
  return {
    id: row.id,
    ownerId: row.owner_id,
    selection,
    identityKey: row.identity_key,
    provenance: decodedProvenance,
    payload: isRecord(payload) && 'candidatePayload' in payload ? payload.candidatePayload as TPayload : payload,
    lifecycleState: row.lifecycle_state,
    createdAt: row.created_at ?? row.createdAt ?? '',
    supersededAt: row.superseded_at ?? row.supersededAt ?? null,
  };
}

function provenanceFromPayload(value: Record<string, unknown>, fallback: PreparedPlanCandidateProvenance): PreparedPlanCandidateProvenance {
  const stringOrNull = (item: unknown) => typeof item === 'string' ? item : null;
  const numberOrNull = (item: unknown) => typeof item === 'number' && Number.isFinite(item) ? item : null;
  return {
    ...fallback,
    policyId: typeof value.policyId === 'string' ? value.policyId : fallback.policyId,
    policyVersion: typeof value.policyVersion === 'string' ? value.policyVersion : fallback.policyVersion,
    sourceEvidenceFingerprint: typeof value.sourceEvidenceFingerprint === 'string' ? value.sourceEvidenceFingerprint : fallback.sourceEvidenceFingerprint,
    generatedOn: typeof value.generatedOn === 'string' ? value.generatedOn : fallback.generatedOn,
    startDate: stringOrNull(value.startDate),
    eventDate: stringOrNull(value.eventDate),
    pathwayIntentRevision: numberOrNull(value.pathwayIntentRevision),
    // A durable candidate is research preparation by definition. Never let a
    // stored or tampered flag promote it toward production or authorization.
    researchOnly: true,
    productionEligible: false,
    publicationAuthorized: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
