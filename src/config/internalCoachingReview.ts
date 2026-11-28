/**
 * Product-owner supplied 5K review metadata. This records the stated coaching
 * decision for internal builds; it is not a cryptographic release approval
 * because the content hash and signature have not been supplied.
 */
export const internalBeginner5kCoachingReview = Object.freeze({
  reviewerId: 'coach-reviewer-01',
  qualificationVerifiedPrivately: true,
  reviewedPolicy: 'torto.5k.beginner@1.0.0',
  reviewedOn: '2026-11-20',
  scope: 'complete_programme_publication',
  decision: 'approved',
  contentHash: null,
  signature: null,
  cryptographicallyVerified: false,
} as const);
