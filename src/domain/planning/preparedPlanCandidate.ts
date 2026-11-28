/**
 * Immutable prepared-plan candidates are research/preparation calendars that
 * were generated from a specific account profile and evidence snapshot.
 *
 * They are deliberately not active plans: the authorization and publication
 * gates remain the only way a candidate can become executable.
 */
export type PreparedPlanGoalFamily = '5k' | '10k' | 'half_marathon' | 'marathon';
export type PreparedPlanCandidateLifecycle = 'prepared' | 'superseded';

export type PreparedPlanCandidateSelection = Readonly<{
  goalFamily: PreparedPlanGoalFamily;
  objective: string;
  pathway: string;
}>;

export type PreparedPlanCandidateProvenance = Readonly<{
  goalFamily: PreparedPlanGoalFamily;
  objective: string;
  pathway: string;
  policyId: string;
  policyVersion: string;
  sourceEvidenceFingerprint: string;
  /** Runner-local calendar date on which this calendar was prepared. */
  generatedOn: string;
  startDate: string | null;
  eventDate: string | null;
  pathwayIntentRevision: number | null;
  researchOnly: boolean;
  productionEligible: boolean;
  /** A prepared candidate can never claim publication authorization. */
  publicationAuthorized: false;
}>;

export type PreparedPlanCandidate<TPayload = unknown> = Readonly<{
  id: string;
  ownerId: string;
  selection: PreparedPlanCandidateSelection;
  identityKey: string;
  provenance: PreparedPlanCandidateProvenance;
  payload: TPayload;
  lifecycleState: PreparedPlanCandidateLifecycle;
  createdAt: string;
  supersededAt: string | null;
}>;

export function preparedPlanCandidateIdentityKey(selection: PreparedPlanCandidateSelection): string {
  return `${selection.goalFamily}:${selection.objective}:${selection.pathway}`;
}

export function isPreparedPlanGoalFamily(value: unknown): value is PreparedPlanGoalFamily {
  return value === '5k' || value === '10k' || value === 'half_marathon' || value === 'marathon';
}

export function isPreparedPlanCandidateLifecycle(value: unknown): value is PreparedPlanCandidateLifecycle {
  return value === 'prepared' || value === 'superseded';
}

/** Defensive validation used when decoding durable rows. */
export function assertPreparedPlanCandidateSelection(selection: PreparedPlanCandidateSelection): void {
  if (!isPreparedPlanGoalFamily(selection.goalFamily)) throw new Error('invalid_prepared_candidate_goal_family');
  if (!selection.objective.trim()) throw new Error('invalid_prepared_candidate_objective');
  if (!selection.pathway.trim()) throw new Error('invalid_prepared_candidate_pathway');
}

export function assertPreparedPlanCandidateProvenance(provenance: PreparedPlanCandidateProvenance): void {
  if (!isPreparedPlanGoalFamily(provenance.goalFamily)) throw new Error('invalid_prepared_candidate_goal_family');
  if (!provenance.objective.trim() || !provenance.pathway.trim()) throw new Error('invalid_prepared_candidate_selection');
  if (!provenance.policyId.trim() || !provenance.policyVersion.trim()) throw new Error('invalid_prepared_candidate_policy');
  if (!provenance.sourceEvidenceFingerprint.trim()) throw new Error('invalid_prepared_candidate_evidence');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.generatedOn)) throw new Error('invalid_prepared_candidate_generated_on');
  if (!provenance.researchOnly) throw new Error('prepared_candidate_must_be_research_only');
  if (provenance.productionEligible) throw new Error('prepared_candidate_must_not_be_production_eligible');
  if (provenance.publicationAuthorized !== false) throw new Error('prepared_candidate_must_not_be_authorized');
}
