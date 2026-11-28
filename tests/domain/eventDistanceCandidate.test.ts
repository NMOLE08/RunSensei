import { create10kCandidatePolicy, createMarathonCandidatePolicy, generateEventDistanceCandidate } from '@/application/eventDistanceCandidate';
import { internalBeginner5kCoachingReview } from '@/config/internalCoachingReview';
import { emptyFitnessAssessmentDraft, type FitnessAssessmentResult } from '@/domain/assessment/types';
import { validateMultiDistancePolicy } from '@/domain/planning/multiDistancePolicy';

const assessment: FitnessAssessmentResult = {
  version: 'system-a-v1', code: 'eligible_for_policy_selection', classification: 'intermediate', confidence: 'reliable',
  reasons: [], missing: [], alternatives: [], inputFingerprint: 'candidate-input', createdAt: '2026-11-27T00:00:00.000Z',
};

function draft(goal: '10k' | 'marathon') {
  return {
    ...emptyFitnessAssessmentDraft('runner-a', 'Asia/Calcutta'),
    goal,
    trainingObjective: 'finish' as const,
    currentTrainingStatus: 'currently_training' as const,
    interruption: 'none' as const,
    planStartDate: '2026-11-30',
    trainingDays: [1, 3, 5, 6],
    preferredLongDay: 6,
    weeklyMinutes: goal === '10k' ? '150' : '240',
    longestSessionMinutes: goal === '10k' ? '60' : '90',
    comfortableRunMinutes: goal === '10k' ? '40' : '60',
    currentCapabilityConfirmedAt: '2026-11-27',
  };
}

describe('event-distance review candidates', () => {
  it('builds a complete twelve-week 10K calendar without authorizing publication', () => {
    const result = generateEventDistanceCandidate(draft('10k'), assessment);
    expect(result).toMatchObject({ kind: 'plan', goalFamily: '10k', title: '12-week 10K plan' });
    if (!result || result.kind !== 'plan') throw new Error('Expected 10K candidate');
    expect(result.weeks).toHaveLength(12);
    expect(result.weeks.flatMap((week) => week.workouts)).toHaveLength(48);
    expect(result.weeks.at(-1)?.workouts.at(-1)?.target).toEqual({ kind: 'distance_meters', value: 10_000 });
    expect(result.policy.releaseAuthorized).toBe(false);
    expect(result.policy.lifecycle).toBe('under_review');
    expect(validateMultiDistancePolicy(result.policy)).toEqual([]);
  });

  it('builds an eighteen-week marathon calendar with the exact event distance', () => {
    const result = generateEventDistanceCandidate(draft('marathon'), assessment);
    expect(result).toMatchObject({ kind: 'plan', goalFamily: 'marathon', title: '18-week marathon plan' });
    if (!result || result.kind !== 'plan') throw new Error('Expected marathon candidate');
    expect(result.weeks).toHaveLength(18);
    expect(result.weeks.at(-1)?.workouts.at(-1)?.target).toEqual({ kind: 'distance_meters', value: 42_195 });
    expect(result.weeks.every((week) => week.workouts.length === 3 || week.workouts.length === 4)).toBe(true);
    expect(validateMultiDistancePolicy(result.policy)).toEqual([]);
  });

  it('keeps entry evidence and objective requirements explicit', () => {
    expect(generateEventDistanceCandidate({ ...draft('10k'), trainingObjective: 'improve_performance' }, assessment)).toMatchObject({ kind: 'blocked', reasonCodes: ['finish_objective_required'] });
    const blocked = generateEventDistanceCandidate({ ...draft('marathon'), weeklyMinutes: '30', longestSessionMinutes: '20', comfortableRunMinutes: '10', trainingDays: [1, 3, 6] }, assessment);
    expect(blocked).toMatchObject({ kind: 'blocked' });
    if (!blocked || blocked.kind !== 'blocked') throw new Error('Expected evidence blocker');
    expect(blocked.reasonCodes).toEqual(expect.arrayContaining(['weekly_running_below_candidate_entry', 'longest_session_below_candidate_entry', 'comfortable_running_below_candidate_entry', 'four_training_days_required']));
  });

  it('records the supplied reviewer metadata without inventing cryptographic proof', () => {
    expect(internalBeginner5kCoachingReview).toMatchObject({ reviewerId: 'coach-reviewer-01', reviewedPolicy: 'torto.5k.beginner@1.0.0', decision: 'approved', cryptographicallyVerified: false });
    expect(internalBeginner5kCoachingReview.contentHash).toBeNull();
    expect(internalBeginner5kCoachingReview.signature).toBeNull();
  });

  it('keeps candidate policy constructors deterministic', () => {
    expect(create10kCandidatePolicy()).toEqual(create10kCandidatePolicy());
    expect(createMarathonCandidatePolicy()).toEqual(createMarathonCandidatePolicy());
  });
});
