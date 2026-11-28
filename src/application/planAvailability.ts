import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { HalfMarathonPathwayIntentRepository } from '@/data/halfMarathonPathwayIntentRepository';
import { TrainingRepository } from '@/data/repositories';
import { evaluatePlanAvailability, type PlanAvailability } from '@/domain/assessment/planAvailability';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft, type FitnessAssessmentDraft } from '@/domain/assessment/types';
import { loadRemoteOnboardingAnswers } from '@/services/account/onboardingProgress';
import { requireActiveAccountId } from './localAccount';
import type { CurrentBeginner5kPublication } from './currentBeginner5kPublication';
import { previewIdentityFor, samePlanPreviewIdentity, type PlanPreviewIdentity } from './planPreviewIdentity';
import type { EventDistanceCandidate } from './eventDistanceCandidate';
import { resolvePreparedPlanCandidate, type PreparedPlanCandidateView } from './preparedPlanCandidate';
import type { CurrentAccountPlanFacts } from './planFacts';

export type { CurrentAccountPlanFacts } from './planFacts';

/** Reads only the active authenticated account's local planning facts. */
export type CurrentPlanAvailability = PlanAvailability & {
  previewContext: PlanPreviewIdentity;
  beginner5kPublication?: CurrentBeginner5kPublication;
  eventDistanceCandidate?: EventDistanceCandidate;
  preparedCandidate?: PreparedPlanCandidateView;
};

export async function openPlanAvailability(options: { regenerate?: boolean } = {}): Promise<CurrentPlanAvailability> {
  const facts = await loadCurrentAccountPlanFacts();
  const availability=evaluatePlanAvailability({ draft: facts.draft, assessment: facts.assessment, activeSnapshot: facts.activeSnapshot });
  const previewContext = previewIdentityFor(facts.ownerId, facts.draft, undefined, undefined, facts.draft?.goal === 'half_marathon' ? facts.pathwayIntent : null);
  const resolution = await resolvePreparedPlanCandidate(facts, { regenerate: options.regenerate });
  const preparedCandidate = resolution.kind === 'candidate' ? resolution.value : undefined;
  const eventDistanceCandidate = preparedCandidate?.payload.kind === 'event_distance'
    ? preparedCandidate.payload.candidate
    : resolution.kind === 'blocked' && (resolution.goalFamily === '10k' || resolution.goalFamily === 'marathon')
      ? { kind: 'blocked' as const, goalFamily: resolution.goalFamily, reasonCodes: resolution.reasonCodes }
      : undefined;
  // Historical saved weeks remain readable without a release-service round trip.
  if(facts.draft?.goal==='5k'&&availability.state!=='active_approved') {
    const {getCurrentBeginner5kPublicationStatus}=await import('./currentBeginner5kPublication');
    const publication=await getCurrentBeginner5kPublicationStatus();
    // The publication service reads durable facts independently to preserve its
    // authorization boundary. Re-read once before combining its result so a
    // goal or evidence edit cannot pair an old availability with a new draft.
    const currentFacts = await loadCurrentAccountPlanFacts();
    if (currentFacts.ownerId !== facts.ownerId) throw new Error('Account changed while reading plan status.');
    const currentContext = previewIdentityFor(currentFacts.ownerId, currentFacts.draft, undefined, undefined, currentFacts.draft?.goal === 'half_marathon' ? currentFacts.pathwayIntent : null);
    await assertPlanReadStillCurrent(facts.ownerId, { expected: previewContext, current: currentContext, publication: publication.previewContext });
    // A research preview and authorization are independent. Keep the candidate
    // account-scoped here so an internal build can render it without treating it
    // as an active plan or weakening the publication gate.
    const candidatePreview = preparedCandidate?.payload.kind === 'experimental_5k' ? preparedCandidate.payload.preview : undefined;
    const canPublish = canPublishPreparedBeginner5k(publication, preparedCandidate);
    return {...availability,consumerStatus:publication.status,previewContext,beginner5kPublication:{...publication,preview:candidatePreview,canPublish},eventDistanceCandidate,preparedCandidate};
  }
  // Every goal family gets the same final ownership check. Only the 5K service
  // path needs the additional identity re-read above, so other goals do not pay
  // for a second durable facts load.
  await assertPlanReadStillCurrent(facts.ownerId);
  return {...availability,previewContext,eventDistanceCandidate,preparedCandidate};
}

/**
 * Never publish a different calendar than the one displayed. Authorization is
 * still re-checked independently by the publication service; a later health
 * signal keeps the saved calendar visible but blocks publication here.
 */
export function canPublishPreparedBeginner5k(publication: Pick<CurrentBeginner5kPublication, 'canPublish'>, candidate?: PreparedPlanCandidateView): boolean {
  return publication.canPublish
    && candidate?.payload.kind === 'experimental_5k'
    && Boolean(candidate.payload.preview)
    && !candidate.staleAgainstCurrentProfile.changed
    && !candidate.healthHold.active;
}

async function assertPlanReadStillCurrent(ownerId: string, identity?: Readonly<{ expected: PlanPreviewIdentity; current: PlanPreviewIdentity | null; publication?: PlanPreviewIdentity | null }>): Promise<void> {
  if (await requireActiveAccountId() !== ownerId) throw new Error('Account changed while reading plan status.');
  if (identity && (!identity.current
    || !samePlanPreviewIdentity(identity.expected, identity.current)
    || !identity.publication
    || !samePlanPreviewIdentity(identity.expected, identity.publication))) {
    throw new Error('Plan information changed while reading the research preview. Please try again.');
  }
}

/** Shared account-scoped facts for status and non-persistent research previews. */
export async function loadCurrentAccountPlanFacts(): Promise<CurrentAccountPlanFacts> {
  const ownerId = await requireActiveAccountId();
  const database = await openAppDatabase();
  await migrate(database, new Date().toISOString());
  const assessments = new FitnessAssessmentRepository(database, ownerId);
  const plans = new TrainingRepository(database, ownerId);
  const intents = new HalfMarathonPathwayIntentRepository(database, ownerId);
  const [localDraft, latestAssessment, execution, pathwayIntent] = await Promise.all([assessments.loadDraft(), assessments.latestResult(), plans.getActiveExecution(), intents.get()]);
  // A runner can sign in on a second device before a local draft exists. Read
  // their account-owned Supabase answers through RLS, but do not claim, alter,
  // or persist any legacy/other-account local data as part of this status read.
  const draft = localDraft ? normalizeFitnessAssessmentDraft(localDraft) : await loadAccountDraft(ownerId);
  // Prefer the immutable assessment for the exact current evidence. Timestamp
  // ordering alone can select a different historical or legacy assessment.
  // If no exact result exists, retain the latest different result so genuine
  // evidence edits still surface as an outdated assessment.
  const assessment = draft
    ? await assessments.resultForInputFingerprint(assessmentEvidenceFingerprint(draft)) ?? latestAssessment
    : latestAssessment;
  return { ownerId, draft, assessment, activeSnapshot: execution?.snapshot ?? null, pathwayIntent };
}

async function loadAccountDraft(ownerId: string): Promise<FitnessAssessmentDraft | null> {
  try {
    const answers = await loadRemoteOnboardingAnswers(ownerId);
    if (!answers) return null;
    return normalizeFitnessAssessmentDraft({
      ...emptyFitnessAssessmentDraft(ownerId, typeof answers.timezone === 'string' ? answers.timezone : 'UTC'),
      ...answers,
      id: 'system-a',
      ownerId,
      updatedAt: typeof answers.updatedAt === 'string' ? answers.updatedAt : '',
    } as FitnessAssessmentDraft);
  } catch (error) {
    throw new Error('Saved runner information could not be read while offline. Reconnect and try again.', { cause: error });
  }
}
