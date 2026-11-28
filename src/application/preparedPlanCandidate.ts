import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import type { HalfMarathonResearchSimulation } from '@/domain/planning/halfMarathonDraft';
import { validateMultiDistancePolicy } from '@/domain/planning/multiDistancePolicy';
import {
  preparedPlanCandidateIdentityKey,
  type PreparedPlanCandidate,
  type PreparedPlanCandidateProvenance,
  type PreparedPlanCandidateSelection,
  type PreparedPlanGoalFamily,
} from '@/domain/planning/preparedPlanCandidate';
import { runnerLocalDate } from '@/domain/planning/beginner5kRunnerEvidence';
import type { HalfMarathonReturnReadiness } from '@/domain/planning/halfMarathonReturnReadiness';
import { beginner5kPathwayForExperience, createExperimental5kPreview, type Experimental5kPreview } from '@/domain/research/experimental5kPreview';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { PreparedPlanCandidateRepository } from '@/data/preparedPlanCandidateRepository';
import { generateEventDistanceCandidate, type EventDistanceCandidate } from './eventDistanceCandidate';
import { generateCurrentHalfMarathonEventCandidate } from './halfMarathonEventCandidate';
import type { CurrentAccountPlanFacts } from './planFacts';

export type PreparedPlanPayload =
  | Readonly<{ kind: 'experimental_5k'; preview: Experimental5kPreview }>
  | Readonly<{ kind: 'event_distance'; candidate: Extract<EventDistanceCandidate, { kind: 'plan' }> }>
  | Readonly<{ kind: 'half_marathon'; simulation: Extract<HalfMarathonResearchSimulation, { kind: 'simulation' }> }>;

export type PreparedPlanHealthHold = Readonly<{
  active: boolean;
  reasonCodes: readonly string[];
  assessmentReasons?: readonly string[];
}>;

export type PreparedPlanCandidateView = Readonly<{
  candidate: PreparedPlanCandidate<PreparedPlanPayload>;
  payload: PreparedPlanPayload;
  /**
   * Typed, non-blocking provenance metadata. A changed profile never deletes or
   * hides the saved calendar; callers may show a regenerate indication instead.
   */
  staleAgainstCurrentProfile: Readonly<{
    changed: boolean;
    generatedEvidenceFingerprint: string;
    currentEvidenceFingerprint: string;
  }>;
  /**
   * Typed safety metadata for a later health signal. The saved calendar stays
   * visible for review, but activation, publication, and regeneration stay
   * blocked until the health review is resolved.
   */
  healthHold: PreparedPlanHealthHold;
}>;

export type PreparedPlanCandidateResolution =
  | Readonly<{ kind: 'active_snapshot' }>
  | Readonly<{ kind: 'candidate'; value: PreparedPlanCandidateView }>
  | Readonly<{
    kind: 'blocked';
    goalFamily: PreparedPlanGoalFamily;
    reasonCodes: readonly string[];
    missingEvidence?: readonly string[];
    assessmentReasons?: readonly string[];
    readiness?: HalfMarathonReturnReadiness;
    persistenceFailed?: boolean;
  }>
  | Readonly<{ kind: 'not_applicable' }>;

export type ResolvePreparedPlanCandidateOptions = Readonly<{
  nowDate?: string;
  evaluationDate?: string;
  persist?: boolean;
  regenerate?: boolean;
  createdAt?: string;
  repository?: PreparedPlanCandidateRepository<PreparedPlanPayload>;
}>;

type GeneratedPayload = Readonly<{
  payload: PreparedPlanPayload;
  policyId: string;
  policyVersion: string;
  startDate: string | null;
  eventDate: string | null;
  researchOnly: boolean;
  productionEligible: boolean;
}>;

type GenerationResult =
  | Readonly<{ kind: 'generated'; value: GeneratedPayload }>
  | Readonly<{ kind: 'blocked'; reasonCodes: readonly string[]; missingEvidence?: readonly string[]; assessmentReasons?: readonly string[]; readiness?: HalfMarathonReturnReadiness }>;

/**
 * Resolution order:
 * 1. authorized active PlanSnapshot (never replaced by a candidate);
 * 2. matching account-owned prepared candidate (date passage alone is ignored);
 * 3. current-evidence generation, validation, then atomic persistence;
 * 4. the exact blocker.
 */
export async function resolvePreparedPlanCandidate(facts: CurrentAccountPlanFacts, options: ResolvePreparedPlanCandidateOptions = {}): Promise<PreparedPlanCandidateResolution> {
  if (facts.activeSnapshot?.plan.mode === 'real' && facts.activeSnapshot.plan.recommendationState === 'active') return { kind: 'active_snapshot' };
  const draft = facts.draft;
  if (!draft) return { kind: 'not_applicable' };
  const selection = selectionForFacts(facts);
  if (!selection) {
    if (draft.goal === '5k') return { kind: 'blocked', goalFamily: '5k', reasonCodes: ['no_explicit_pathway_for_experience'] };
    return { kind: 'not_applicable' };
  }
  const repository = options.repository ?? await openPreparedPlanCandidateRepository(facts.ownerId);
  if (!options.regenerate) {
    const saved = await readSavedCandidate(repository, selection, facts.ownerId);
    if (saved.kind === 'invalid') return invalidStoredCandidate(selection);
    if (saved.kind === 'candidate') {
      // A later health signal is non-blocking for visibility: the saved
      // calendar remains available for review with explicit safety metadata.
      // Activation, publication, and regeneration remain blocked elsewhere.
      return { kind: 'candidate', value: candidateView(saved.value, facts, healthBlockForFacts(facts)) };
    }
  }
  const generated = generatePayload(facts, selection, options);
  if (generated.kind === 'blocked') return { goalFamily: selection.goalFamily, ...generated };
  // A current health signal is a safety gate for generation and regeneration
  // too, including goal families whose research planner has no health rule.
  // Nothing new is stored while review is required.
  const health = healthBlockForFacts(facts);
  if (health) return { kind: 'blocked', goalFamily: selection.goalFamily, ...health };
  if (options.persist === false) return { kind: 'candidate', value: transientView(facts, selection, generated.value) };
  const createdAt = options.createdAt ?? new Date().toISOString();
  const generatedOn = generatedOnForDraft(draft, options.nowDate);
  const provenance: PreparedPlanCandidateProvenance = {
    goalFamily: selection.goalFamily,
    objective: selection.objective,
    pathway: selection.pathway,
    policyId: generated.value.policyId,
    policyVersion: generated.value.policyVersion,
    sourceEvidenceFingerprint: assessmentEvidenceFingerprint(draft),
    generatedOn,
    startDate: generated.value.startDate,
    eventDate: generated.value.eventDate,
    pathwayIntentRevision: facts.pathwayIntent?.revision ?? null,
    researchOnly: generated.value.researchOnly,
    productionEligible: generated.value.productionEligible,
    publicationAuthorized: false,
  };
  try {
    const saved = await repository.save({
      id: preparedCandidateId(facts.ownerId, selection, provenance, createdAt),
      selection,
      provenance,
      payload: generated.value.payload,
      createdAt,
      // Rebuild only on an explicit regeneration request; ordinary reads reuse
      // the saved calendar even if it is now stale against the profile.
      force: options.regenerate === true,
    });
    return { kind: 'candidate', value: candidateView(saved, facts) };
  } catch (error) {
    // A newer concurrent write is authoritative; never replace it with this
    // delayed request. Other persistence failures must not report success.
    if (error instanceof Error && (error.message === 'prepared_candidate_stale' || error.message === 'prepared_candidate_conflict')) {
      const saved = await readSavedCandidate(repository, selection, facts.ownerId);
      if (saved.kind === 'invalid') return invalidStoredCandidate(selection);
      if (saved.kind === 'candidate') return { kind: 'candidate', value: candidateView(saved.value, facts, healthBlockForFacts(facts)) };
    }
    return { kind: 'blocked', goalFamily: selection.goalFamily, reasonCodes: ['candidate_persistence_failed'], persistenceFailed: true };
  }
}

export function preparedCandidateSelectionFor(facts: CurrentAccountPlanFacts): PreparedPlanCandidateSelection | null {
  return selectionForFacts(facts);
}

function selectionForFacts(facts: CurrentAccountPlanFacts): PreparedPlanCandidateSelection | null {
  const draft = facts.draft;
  if (!draft) return null;
  const objective = draft.trainingObjective;
  if (draft.goal === '5k') {
    const pathway = beginner5kPathwayForExperience(draft.first5kExperience);
    return pathway ? { goalFamily: '5k', objective, pathway: pathway.id } : null;
  }
  if (draft.goal === '10k') return { goalFamily: '10k', objective, pathway: 'event_distance_conservative' };
  if (draft.goal === 'marathon') return { goalFamily: 'marathon', objective, pathway: 'event_distance_conservative' };
  if (draft.goal === 'half_marathon') {
    // Foundation preparation remains in its existing repository. Only an
    // explicit event-preparation (or legacy no-intent) selection is an event
    // candidate.
    const choice = facts.pathwayIntent?.choice ?? 'event_preparation';
    return choice === 'event_preparation' ? { goalFamily: 'half_marathon', objective, pathway: 'event_preparation' } : null;
  }
  return null;
}

function generatePayload(facts: CurrentAccountPlanFacts, selection: PreparedPlanCandidateSelection, options: ResolvePreparedPlanCandidateOptions): GenerationResult {
  const draft = facts.draft!;
  if (selection.goalFamily === '5k') {
    const nowDate = options.nowDate ?? runnerLocalDate(new Date().toISOString(), draft.timezone);
    if (!nowDate || !isDateOnly(nowDate)) return { kind: 'blocked', reasonCodes: ['invalid_evidence_timezone_or_evaluation_date'] };
    const preview = createExperimental5kPreview({ ownerId: facts.ownerId, draft, assessment: facts.assessment, nowDate });
    if (preview.kind !== 'preview') return { kind: 'blocked', reasonCodes: preview.reasonCodes };
    if (!preview.systemC.valid || !preview.feasibility.validation.valid) return { kind: 'blocked', reasonCodes: ['candidate_validation_failed'] };
    return {
      kind: 'generated',
      value: {
        payload: { kind: 'experimental_5k', preview },
        policyId: preview.pathway.id,
        policyVersion: preview.pathway.version,
        startDate: preview.scheduleAnchor,
        eventDate: preview.sessions.at(-1)?.date ?? null,
        researchOnly: true,
        productionEligible: false,
      },
    };
  }
  if (selection.goalFamily === '10k' || selection.goalFamily === 'marathon') {
    if (!facts.assessment) return { kind: 'blocked', reasonCodes: ['assessment_missing_or_outdated'] };
    const candidate = generateEventDistanceCandidate(draft, facts.assessment);
    if (!candidate) return { kind: 'blocked', reasonCodes: ['goal_not_supported'] };
    if (candidate.kind !== 'plan') return { kind: 'blocked', reasonCodes: candidate.reasonCodes };
    const issues = validateMultiDistancePolicy(candidate.policy);
    if (issues.length) return { kind: 'blocked', reasonCodes: ['invalid_candidate_policy', ...issues] };
    return {
      kind: 'generated',
      value: {
        payload: { kind: 'event_distance', candidate },
        policyId: candidate.policy.id,
        policyVersion: candidate.policy.version,
        startDate: candidate.weeks[0]?.workouts[0]?.date ?? null,
        eventDate: candidate.weeks.at(-1)?.workouts.at(-1)?.date ?? null,
        researchOnly: true,
        productionEligible: false,
      },
    };
  }
  const half = generateCurrentHalfMarathonEventCandidate(facts, options.evaluationDate);
  if (half.kind !== 'candidate') return half;
  if (!half.simulation.validation.valid) return { kind: 'blocked', reasonCodes: ['candidate_validation_failed', ...half.simulation.validation.issues] };
  return {
    kind: 'generated',
    value: {
      payload: { kind: 'half_marathon', simulation: half.simulation },
      policyId: half.simulation.policy.id,
      policyVersion: half.simulation.policy.version,
      startDate: half.simulation.weeks[0]?.workouts[0]?.date ?? null,
      eventDate: half.simulation.weeks.at(-1)?.workouts.at(-1)?.date ?? null,
      researchOnly: true,
      productionEligible: false,
    },
  };
}

type HealthBlock = Pick<Exclude<PreparedPlanCandidateResolution, { kind: 'candidate' | 'active_snapshot' | 'not_applicable' }>, 'reasonCodes' | 'assessmentReasons'>;

function healthBlockForFacts(facts: CurrentAccountPlanFacts): HealthBlock | null {
  const draft = facts.draft;
  if (!draft) return null;
  const reported = Boolean(draft.healthConcern || draft.interruption === 'health_related' || draft.interruptionReason === 'illness_or_injury');
  const assessed = facts.assessment?.code === 'health_hold';
  if (!reported && !assessed) return null;
  return {
    reasonCodes: reported ? ['health_review_required'] : ['assessment_health_hold'],
    assessmentReasons: assessed ? facts.assessment?.reasons : undefined,
  };
}

function healthHoldView(health: HealthBlock | null): PreparedPlanHealthHold {
  if (!health) return { active: false, reasonCodes: [] };
  return {
    active: true,
    reasonCodes: [...health.reasonCodes],
    ...(health.assessmentReasons ? { assessmentReasons: [...health.assessmentReasons] } : {}),
  };
}

function candidateView(candidate: PreparedPlanCandidate<PreparedPlanPayload>, facts: CurrentAccountPlanFacts, health: HealthBlock | null = null): PreparedPlanCandidateView {
  const currentEvidenceFingerprint = facts.draft ? assessmentEvidenceFingerprint(facts.draft) : candidate.provenance.sourceEvidenceFingerprint;
  return {
    candidate,
    payload: candidate.payload,
    staleAgainstCurrentProfile: {
      changed: candidate.provenance.sourceEvidenceFingerprint !== currentEvidenceFingerprint,
      generatedEvidenceFingerprint: candidate.provenance.sourceEvidenceFingerprint,
      currentEvidenceFingerprint,
    },
    healthHold: healthHoldView(health),
  };
}

function transientView(facts: CurrentAccountPlanFacts, selection: PreparedPlanCandidateSelection, generated: GeneratedPayload): PreparedPlanCandidateView {
  const provenance: PreparedPlanCandidateProvenance = {
    goalFamily: selection.goalFamily,
    objective: selection.objective,
    pathway: selection.pathway,
    policyId: generated.policyId,
    policyVersion: generated.policyVersion,
    sourceEvidenceFingerprint: facts.draft ? assessmentEvidenceFingerprint(facts.draft) : 'unknown',
    generatedOn: generatedOnForDraft(facts.draft!, undefined),
    startDate: generated.startDate,
    eventDate: generated.eventDate,
    pathwayIntentRevision: facts.pathwayIntent?.revision ?? null,
    researchOnly: generated.researchOnly,
    productionEligible: generated.productionEligible,
    publicationAuthorized: false,
  };
  const candidate: PreparedPlanCandidate<PreparedPlanPayload> = {
    id: 'transient',
    ownerId: facts.ownerId,
    selection,
    identityKey: preparedPlanCandidateIdentityKey(selection),
    provenance,
    payload: generated.payload,
    lifecycleState: 'prepared',
    createdAt: '',
    supersededAt: null,
  };
  return { candidate, payload: generated.payload, staleAgainstCurrentProfile: { changed: false, generatedEvidenceFingerprint: provenance.sourceEvidenceFingerprint, currentEvidenceFingerprint: provenance.sourceEvidenceFingerprint }, healthHold: { active: false, reasonCodes: [] } };
}

function generatedOnForDraft(draft: FitnessAssessmentDraft, nowDate?: string): string {
  if (nowDate && isDateOnly(nowDate)) return nowDate;
  return runnerLocalDate(new Date().toISOString(), draft.timezone) ?? new Date().toISOString().slice(0, 10);
}

function preparedCandidateId(ownerId: string, selection: PreparedPlanCandidateSelection, provenance: PreparedPlanCandidateProvenance, createdAt: string): string {
  return `prepared:${ownerId}:${preparedPlanCandidateIdentityKey(selection)}:${provenance.sourceEvidenceFingerprint}:${createdAt}`;
}

type SavedCandidateRead =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'candidate'; value: PreparedPlanCandidate<PreparedPlanPayload> }>
  | Readonly<{ kind: 'invalid' }>;

async function readSavedCandidate(repository: PreparedPlanCandidateRepository<PreparedPlanPayload>, selection: PreparedPlanCandidateSelection, ownerId: string): Promise<SavedCandidateRead> {
  let current: PreparedPlanCandidate<PreparedPlanPayload> | null;
  try {
    current = await repository.findCurrent(selection);
  } catch (error) {
    // Corrupt durable JSON is a safe blocked result, not a renderer crash and
    // not a reason to overwrite the row with a freshly generated calendar.
    if (error instanceof Error && /^invalid_prepared_candidate_/.test(error.message)) return { kind: 'invalid' };
    throw error;
  }
  if (!current) return { kind: 'none' };
  if (current.ownerId !== ownerId
    || current.provenance.goalFamily !== current.selection.goalFamily
    || current.identityKey !== preparedPlanCandidateIdentityKey(current.selection)
    || !isStoredPreparedPlanPayload(current.payload)) return { kind: 'invalid' };
  return { kind: 'candidate', value: current };
}

function invalidStoredCandidate(selection: PreparedPlanCandidateSelection): PreparedPlanCandidateResolution {
  return { kind: 'blocked', goalFamily: selection.goalFamily, reasonCodes: ['prepared_candidate_payload_invalid'] };
}

/**
 * Structural validation at the durable boundary. It does not recompute any
 * policy; it only rejects rows whose shape cannot be rendered safely.
 */
export function isStoredPreparedPlanPayload(value: unknown): value is PreparedPlanPayload {
  if (!isRecord(value)) return false;
  if (value.kind === 'experimental_5k') return isExperimental5kStoredPreview(value.preview);
  if (value.kind === 'event_distance') return isEventDistanceStoredCandidate(value.candidate);
  if (value.kind === 'half_marathon') return isHalfMarathonStoredSimulation(value.simulation);
  return false;
}

function isExperimental5kStoredPreview(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind !== 'preview' || value.researchOnly !== true || value.productionEligible !== false) return false;
  if (!isString(value.inputFingerprint) || !isDateOnlyString(value.scheduleAnchor)) return false;
  if (!isRecord(value.pathway) || !isString(value.pathway.id) || !isString(value.pathway.version)) return false;
  if (!isRecord(value.strictProductionGate) || !isString(value.strictProductionGate.kind)) return false;
  if (!isRecord(value.feasibility) || value.feasibility.kind !== 'feasible' || !isNumberArray(value.feasibility.selectedWeekdays)) return false;
  if (!Array.isArray(value.sessions) || !value.sessions.every(isFirst5kStoredSession)) return false;
  return isRecord(value.systemC) && typeof value.systemC.valid === 'boolean' && isStringArray(value.systemC.violations);
}

function isFirst5kStoredSession(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.week) || !isString(value.code) || !isDateOnlyString(value.date) || !isString(value.phase)) return false;
  if (value.durationSeconds !== null && !isFiniteNumber(value.durationSeconds)) return false;
  if (value.distanceMeters !== null && !isFiniteNumber(value.distanceMeters)) return false;
  if (!Array.isArray(value.steps) || !value.steps.every(isFirst5kStoredStep)) return false;
  return isStringArray(value.policyRefs) && value.draftOnly === true && value.notForProduction === true;
}

function isFirst5kStoredStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isWorkoutStepKind(value.kind)) return false;
  if (value.seconds !== null && !isFiniteNumber(value.seconds)) return false;
  return isFiniteNumber(value.repeats) && (value.rpe === null || isString(value.rpe));
}

function isEventDistanceStoredCandidate(value: unknown): boolean {
  if (!isRecord(value) || value.kind !== 'plan') return false;
  if (value.goalFamily !== '10k' && value.goalFamily !== 'marathon') return false;
  if (!isString(value.title) || !isRecord(value.policy) || !isString(value.policy.id) || !isString(value.policy.version)) return false;
  if (!Array.isArray(value.weeks) || !value.weeks.every(isScheduledStoredWeek)) return false;
  return isRecord(value.validation) && value.validation.valid === true && Array.isArray(value.validation.issues);
}

function isHalfMarathonStoredSimulation(value: unknown): boolean {
  if (!isRecord(value) || value.kind !== 'simulation') return false;
  if (value.researchOnly !== true || value.productionEligible !== false) return false;
  if (!isRecord(value.policy) || !isString(value.policy.id) || !isString(value.policy.version) || value.policy.reviewStatus !== 'draft') return false;
  if (value.band !== 'foundation_3_day' && value.band !== 'established_4_day') return false;
  if (!isStringArray(value.selectionReasons) || !isHalfMarathonStoredDiagnostics(value.diagnostics)) return false;
  if (!Array.isArray(value.weeks) || !value.weeks.every(isScheduledStoredWeek)) return false;
  return isRecord(value.validation) && typeof value.validation.valid === 'boolean' && isStringArray(value.validation.issues);
}

function isHalfMarathonStoredDiagnostics(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.policyReference) || !isRecord(value.input)) return false;
  const input = value.input;
  if (!isNullableNumber(input.weeklyMinutes) || !isNullableNumber(input.longestSessionMinutes) || !isNullableNumber(input.comfortableRunMinutes)) return false;
  if (!isFiniteNumber(input.availableDays) || !isNullableDate(input.fixedGoalDate) || !isNullableNumber(input.preparationWeeks)) return false;
  if (!Array.isArray(value.evidence)) return false;
  const freshness = value.freshness;
  if (!isRecord(freshness)) return false;
  if (!isNullableDate(freshness.evaluationDate) || !isFiniteNumber(freshness.thresholdDays)) return false;
  if (!isNullableDate(freshness.weeklyObservationDate) || !isNullableDate(freshness.longestSessionObservationDate)) return false;
  if (!isNullableNumber(freshness.weeklyEvidenceAgeDays) || !isNullableNumber(freshness.longestSessionEvidenceAgeDays) || !isNullableNumber(freshness.weeklyWindowDays)) return false;
  if (!isString(freshness.comparability) || !['separate_aggregate_and_session', 'same_source_summary', 'unknown'].includes(freshness.comparability)) return false;
  if (value.readiness !== null && (!isRecord(value.readiness) || !isString(value.readiness.state) || !isString(value.readiness.policyReference) || !isNullableDate(value.readiness.lastRunningDate))) return false;
  return (value.nextApplicableRule === null || isString(value.nextApplicableRule)) && isStringArray(value.passedRules) && isStringArray(value.failedRules);
}

function isScheduledStoredWeek(value: unknown): boolean {
  if (!isRecord(value) || !isFiniteNumber(value.week)) return false;
  if (!Array.isArray(value.workouts) || !value.workouts.every(isScheduledStoredWorkout)) return false;
  if (typeof value.recoveryWeek !== 'boolean' || typeof value.taper !== 'boolean') return false;
  return !('warnings' in value) || isStringArray(value.warnings);
}

function isScheduledStoredWorkout(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.week) || !isDateOnlyString(value.date) || !isString(value.slot) || !isString(value.role) || !isString(value.phase) || !isString(value.purpose)) return false;
  if (!isStoredTrainingTarget(value.target) || typeof value.protected !== 'boolean') return false;
  if (!Array.isArray(value.steps) || !value.steps.every(isPolicyStoredStep)) return false;
  return isStringArray(value.policyReferences);
}

function isPolicyStoredStep(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isWorkoutStepKind(value.kind) || !isString(value.instruction) || !isString(value.purpose)) return false;
  if (value.effort !== null && !isString(value.effort)) return false;
  return isStoredTrainingTarget(value.target) && isFiniteNumber(value.repeats);
}

function isStoredTrainingTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'unknown') return true;
  if (value.kind === 'duration_seconds' || value.kind === 'distance_meters') return isFiniteNumber(value.value);
  return false;
}

function isWorkoutStepKind(value: unknown): boolean {
  return isString(value) && ['warmup', 'run', 'walk', 'cooldown', 'event', 'work', 'recovery'].includes(value);
}

function isDateOnlyString(value: unknown): boolean {
  return isString(value) && isDateOnly(value);
}

function isNullableDate(value: unknown): boolean {
  return value === null || isDateOnlyString(value);
}

function isNullableNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

async function openPreparedPlanCandidateRepository(ownerId: string): Promise<PreparedPlanCandidateRepository<PreparedPlanPayload>> {
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  return new PreparedPlanCandidateRepository<PreparedPlanPayload>(database, ownerId);
}
