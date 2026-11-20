/**
 * Immutable, source-controlled training-policy review packages.
 *
 * A package is evidence and governance metadata, not a prescription. It may
 * only become selectable for real plans after a qualified reviewer has signed
 * an authored numerical policy and workout-rule set into a new version.
 */
export type PolicyFamily = 'beginner_walk_run' | 'first_5k' | 'recreational_5k' | 'first_10k' | 'half_marathon_completion' | 'half_marathon_improvement' | 'marathon_completion';
export type PolicyLifecycle = 'draft' | 'reviewed' | 'retired';
export type ReuseStatus = 'original_authored' | 'research_reference_only' | 'permission_required' | 'unknown';

export type PolicyEvidence = {
  id: string;
  title: string;
  url: string;
  accessedOn: string;
  use: 'background_structure' | 'effort_language' | 'risk_context' | 'review_input';
  reuseStatus: ReuseStatus;
  notes: string;
};

export type NumericalRuleCandidate = {
  id: string;
  topic: 'baseline' | 'weekly_load' | 'long_run' | 'recovery_spacing' | 'deload' | 'taper' | 'return_after_interruption' | 'pace_evidence';
  proposedFormula: string | null;
  applicablePopulation: string;
  sourceEvidenceIds: string[];
  limitations: string;
  implementationRationale: string;
  reviewStatus: 'unwritten' | 'draft' | 'reviewed';
};

export type PolicyReviewPackage = {
  schemaVersion: 'training-policy-review-package-v1';
  id: string;
  version: string;
  family: PolicyFamily;
  lifecycle: PolicyLifecycle;
  author: string | null;
  rightsNotes: string;
  engineCompatibility: string;
  evidence: readonly PolicyEvidence[];
  numericalRuleCandidates: readonly NumericalRuleCandidate[];
  reviewer: string | null;
  reviewDate: string | null;
  approvalScope: string | null;
  activation: 'blocked' | 'eligible_after_release_review';
};

export type PolicyPackageResolution =
  | { kind: 'found'; policy: PolicyReviewPackage }
  | { kind: 'unavailable'; code: 'policy_version_unavailable'; message: string };

export type PolicyReleaseReadiness = { ready: boolean; reasons: string[] };

const accessedOn = '2026-10-31';
const sources = {
  baaHalf: { id: 'baa-half', title: 'B.A.A. Boston Half training resources', url: 'https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/', accessedOn, use: 'background_structure' as const, reuseStatus: 'permission_required' as const, notes: 'Public guide; not copied into app content.' },
  baaMarathon: { id: 'baa-marathon', title: 'B.A.A. Boston Marathon training resources', url: 'https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/', accessedOn, use: 'background_structure' as const, reuseStatus: 'permission_required' as const, notes: 'Public guide; not copied into app content.' },
  nyrr: { id: 'nyrr-train', title: 'NYRR training resources', url: 'https://www.nyrr.org/train', accessedOn, use: 'background_structure' as const, reuseStatus: 'permission_required' as const, notes: 'Access may be queue-gated; reuse permission is not established.' },
  cdc: { id: 'cdc-intensity', title: 'CDC: Measuring physical activity intensity', url: 'https://www.cdc.gov/physical-activity-basics/measuring/', accessedOn, use: 'effort_language' as const, reuseStatus: 'research_reference_only' as const, notes: 'Supports understandable relative-effort wording only.' },
  literature: { id: 'peer-reviewed-load', title: 'Peer-reviewed running training-load and injury literature search', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=running+training+load+injury+systematic+review', accessedOn, use: 'risk_context' as const, reuseStatus: 'research_reference_only' as const, notes: 'Heterogeneous evidence; it does not establish a universal increase percentage.' },
} satisfies Record<string, PolicyEvidence>;

const unwritten = (topic: NumericalRuleCandidate['topic'], evidenceIds: string[], population: string): NumericalRuleCandidate => ({
  id: `${topic}-requires-authored-rule`, topic, proposedFormula: null, applicablePopulation: population, sourceEvidenceIds: evidenceIds,
  limitations: 'No original numerical rule has been authored and approved for RunSensei.',
  implementationRationale: 'The engine must return a content-gap result instead of deriving a number from research summaries.', reviewStatus: 'unwritten',
});

const draftPackage = (id: string, family: PolicyFamily, evidence: readonly PolicyEvidence[], population: string): PolicyReviewPackage => ({
  schemaVersion: 'training-policy-review-package-v1', id, version: '0.1.0-draft', family, lifecycle: 'draft', author: null,
  rightsNotes: 'Evidence is recorded for review only. No third-party schedule, table, or numerical prescription is reproduced or licensed for product use.',
  engineCompatibility: 'local-ai-week-v1', evidence,
  numericalRuleCandidates: [
    unwritten('baseline', evidence.map((item) => item.id), population),
    unwritten('weekly_load', ['peer-reviewed-load'], population),
    unwritten('long_run', ['peer-reviewed-load'], population),
    unwritten('recovery_spacing', evidence.map((item) => item.id), population),
    unwritten('deload', ['peer-reviewed-load'], population),
    unwritten('taper', evidence.map((item) => item.id), population),
    unwritten('return_after_interruption', ['peer-reviewed-load'], population),
    unwritten('pace_evidence', ['cdc-intensity'], population),
  ],
  reviewer: null, reviewDate: null, approvalScope: null, activation: 'blocked',
});

/** Engineering-authored candidate values awaiting qualified coach review. */
export const beginner5kCandidateReviewPackage: PolicyReviewPackage = {
  ...draftPackage('beginner-to-5k-candidate', 'first_5k', [sources.cdc, sources.nyrr, sources.literature], 'Adults seeking a first 5K who can comfortably walk/run for 20 minutes.'),
  version: '0.1.0-draft', author: 'RunSensei engineering candidate',
  rightsNotes: 'Original RunSensei candidate workout structures. Research references inform review only; no third-party schedule is reproduced.',
  numericalRuleCandidates: [
    { id: 'entry-baseline-v1', topic: 'baseline', proposedFormula: 'Require known four-week weekly minutes, a known repeatable longest session of at least 20 minutes, and a known comfortable duration of at least 20 minutes.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['cdc-intensity', 'peer-reviewed-load'], limitations: 'Self-report and this threshold are not medical screening or clearance.', implementationRationale: 'Avoids inferring readiness from absent data and starts with run/walk content.', reviewStatus: 'draft' },
    { id: 'frequency-spacing-v1', topic: 'recovery_spacing', proposedFormula: 'Exactly three sessions per seven days, each on a selected weekday with at least one whole rest day between consecutive sessions, including Sunday-to-Monday.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['peer-reviewed-load'], limitations: 'A calendar gap is not a recovery measurement.', implementationRationale: 'Provides an explicit scheduler constraint without adapting another provider schedule.', reviewStatus: 'draft' },
    { id: 'weekly-stage-v1', topic: 'weekly_load', proposedFormula: 'Use authored staged totals of 84, 84, 94, 84, 94, 96, 96, and 95 minutes for the eight candidate weeks; do not apply a generic percentage increase.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['peer-reviewed-load'], limitations: 'Candidate values require coach review; actual completion may be lower and never creates catch-up debt.', implementationRationale: 'Makes weekly load explicit and preserves a non-increasing week four.', reviewStatus: 'draft' },
    { id: 'long-session-v1', topic: 'long_run', proposedFormula: 'Candidate longer-session totals are 31, 31, 35, 31, 35, 40, 40, and 40 minutes; no later session credits an uncompleted longer session.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['peer-reviewed-load'], limitations: 'Time on feet is not a distance or pace prescription.', implementationRationale: 'Separates longer-session boundaries from total weekly load.', reviewStatus: 'draft' },
    { id: 'deload-v1', topic: 'deload', proposedFormula: 'Week four returns to the introductory run/walk tier rather than increasing workload.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['peer-reviewed-load'], limitations: 'The candidate does not claim a universal deload cadence.', implementationRationale: 'An explicit authored stage is easier to validate than an inferred percentage decrease.', reviewStatus: 'draft' },
    { id: 'goal-date-v1', topic: 'taper', proposedFormula: 'A fixed 5K date must be at least 56 calendar days from the requested seven-day start. This candidate has no race-week taper or race prescription.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['nyrr-train'], limitations: 'This is a content-scope boundary, not proof of sufficient preparation.', implementationRationale: 'Rejects compressed plans while deferring taper content to coach review.', reviewStatus: 'draft' },
    { id: 'interruption-v1', topic: 'return_after_interruption', proposedFormula: 'Sustained interruption returns needs_reassessment; an acknowledged miss or harder-than-expected session repeats the current authored stage with no make-up session.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['peer-reviewed-load'], limitations: 'Does not diagnose, clear return to running, or replace health care.', implementationRationale: 'Preserves actual history and prevents automatic catch-up debt.', reviewStatus: 'draft' },
    { id: 'pace-v1', topic: 'pace_evidence', proposedFormula: 'No pace target is issued. Use RPE 2–3 for recovery and RPE 3–4/conversational for run-walk and easy sessions.', applicablePopulation: 'Candidate first-5K adults only.', sourceEvidenceIds: ['cdc-intensity'], limitations: 'RPE is subjective; it is not a physiological measurement.', implementationRationale: 'Avoids treating an aspirational 5K time as present fitness.', reviewStatus: 'draft' },
  ],
};

/** Bundled governance catalog. It intentionally contains no production-ready policies. */
export const bundledPolicyReviewPackages: readonly PolicyReviewPackage[] = [
  draftPackage('beginner-walk-run', 'beginner_walk_run', [sources.cdc, sources.literature], 'Adults starting or returning to run/walk activity.'),
  draftPackage('first-5k', 'first_5k', [sources.cdc, sources.literature, sources.nyrr], 'Adults preparing for a first 5K.'),
  beginner5kCandidateReviewPackage,
  draftPackage('recreational-5k', 'recreational_5k', [sources.cdc, sources.literature, sources.nyrr], 'Recreational runners seeking a 5K goal.'),
  draftPackage('first-10k', 'first_10k', [sources.cdc, sources.literature, sources.nyrr], 'Adults preparing for a first 10K.'),
  draftPackage('half-marathon-completion', 'half_marathon_completion', [sources.baaHalf, sources.nyrr, sources.literature], 'Adults preparing to complete a half marathon.'),
  draftPackage('half-marathon-improvement', 'half_marathon_improvement', [sources.baaHalf, sources.nyrr, sources.literature], 'Experienced runners seeking a half-marathon performance goal.'),
  draftPackage('marathon-completion', 'marathon_completion', [sources.baaMarathon, sources.literature], 'Runners with an established base preparing for a marathon.'),
];

export function releaseReadiness(policy: PolicyReviewPackage): PolicyReleaseReadiness {
  const reasons: string[] = [];
  if (policy.lifecycle !== 'reviewed') reasons.push('policy_not_reviewed');
  if (!policy.author?.trim()) reasons.push('missing_author');
  if (!policy.reviewer?.trim() || !policy.reviewDate || !policy.approvalScope?.trim()) reasons.push('missing_qualified_signoff');
  if (!policy.rightsNotes.trim() || !policy.evidence.length) reasons.push('missing_rights_or_evidence');
  if (!policy.numericalRuleCandidates.length || policy.numericalRuleCandidates.some((rule) => rule.reviewStatus !== 'reviewed' || !rule.proposedFormula?.trim() || !rule.sourceEvidenceIds.length)) reasons.push('incomplete_numerical_rules');
  if (policy.activation !== 'eligible_after_release_review') reasons.push('activation_blocked');
  return { ready: reasons.length === 0, reasons };
}

export class PolicyReviewCatalog {
  constructor(private readonly packages: readonly PolicyReviewPackage[]) {
    const keys = packages.map((item) => `${item.id}@${item.version}`);
    if (new Set(keys).size !== keys.length) throw new Error('Duplicate policy review package version.');
  }

  resolveExact(id: string, version: string): PolicyPackageResolution {
    const policy = this.packages.find((item) => item.id === id && item.version === version);
    return policy ? { kind: 'found', policy } : { kind: 'unavailable', code: 'policy_version_unavailable', message: 'This historical policy version is not bundled. Saved prescription snapshots remain available, but a new plan cannot use a substituted policy.' };
  }

  forGoalDistance(distanceMeters: number): readonly PolicyReviewPackage[] {
    const families: PolicyFamily[] = distanceMeters === 5000 ? ['beginner_walk_run', 'first_5k', 'recreational_5k'] : distanceMeters === 10000 ? ['first_10k'] : distanceMeters === 21097 ? ['half_marathon_completion', 'half_marathon_improvement'] : distanceMeters === 42195 ? ['marathon_completion'] : [];
    return this.packages.filter((item) => families.includes(item.family));
  }
}

export const bundledPolicyReviewCatalog = new PolicyReviewCatalog(bundledPolicyReviewPackages);
