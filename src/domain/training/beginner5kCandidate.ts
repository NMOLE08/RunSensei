import type { PersonalizedTrainingPolicy, PolicyStepRule, PolicyWorkoutRule } from '@/ai/schemas/personalizedWeeklyPlanSchema';

/**
 * ORIGINAL CANDIDATE CONTENT — DEVELOPMENT PREVIEW ONLY.
 *
 * These numbers are engineering-authored candidates for a qualified running
 * coach to review. They are not reviewed coaching advice and cannot activate
 * a real RunSensei plan.
 */
export const BEGINNER_5K_CANDIDATE_ID = 'beginner-to-5k-candidate';
export const BEGINNER_5K_CANDIDATE_VERSION = '0.1.0-draft';

export type Beginner5kTier = 'intro_walk_run' | 'build_walk_run' | 'transition_walk_run' | 'continuous_run';
export type CandidateIssue = 'insufficient_baseline' | 'unsupported_goal' | 'health_hold' | 'needs_reassessment' | 'availability_incompatible' | 'goal_date_incompatible' | 'week_out_of_range';
export type Beginner5kFacts = {
  goalDistanceMeters: number | null;
  comfortableDurationMinutes: number | null;
  recentWeeklyMinutes: number | null;
  longestRepeatableMinutes: number | null;
  interruption: 'none' | 'sustained' | 'unknown';
  concern: boolean;
  availableWeekdays: number[];
  minuteLimits: Record<number, number>;
  weekNumber: number;
  daysUntilGoal: number | null;
  difficultyPreference: 'comfortable' | 'balanced' | 'challenging';
};
export type CandidateAssessment = { kind: 'eligible'; tier: Beginner5kTier; reason: string; repeatWeek: boolean } | { kind: 'ineligible'; issues: CandidateIssue[] };
export type CandidateWeekResponse = 'maintain' | 'repeat_current_week' | 'needs_reassessment' | 'health_hold';

const duration = (min: number, max = min, step = 1) => ({ min, max, step });
const timed = (kind: PolicyStepRule['kind'], minutes: number, minRepeats = 1, maxRepeats = minRepeats): PolicyStepRule => ({ kind, targetKind: 'duration_minutes', range: duration(minutes), minRepeats, maxRepeats });

type CandidateSession = { id: string; type: PolicyWorkoutRule['type']; purpose: string; effort: string; total: number; steps: PolicyStepRule[]; required: PolicyWorkoutRule['requiredStepKinds']; alternatives: string[] };
const walkRun = (id: string, total: number, runMinutes: number, runRepeats: number, walkMinutes: number, walkRepeats: number, purpose: string, type: PolicyWorkoutRule['type'] = 'walk_run'): CandidateSession => ({
  id, type, purpose, effort: 'RPE 3–4: able to speak in full sentences', total,
  required: ['warmup', 'main', 'walk', 'cooldown'],
  steps: [timed('warmup', 5), timed('main', runMinutes, runRepeats), timed('walk', walkMinutes, walkRepeats), timed('cooldown', 5)],
  alternatives: ['Repeat the same session next week after an explicitly missed or harder-than-expected session; do not add missed intervals later.'],
});
const easyRun = (id: string, total: number, main: number, purpose: string, type: PolicyWorkoutRule['type'] = 'easy_run'): CandidateSession => ({
  id, type, purpose, effort: 'RPE 3–4: conversational', total, required: ['warmup', 'main', 'cooldown'],
  steps: [timed('warmup', 5), timed('main', main), timed('cooldown', 5)], alternatives: ['Use the corresponding walk-run session if continuous running is not tolerated at the planned effort.'],
});
const recoveryRun = (id: string, total: number, main: number): CandidateSession => ({
  id, type: 'recovery_run', purpose: 'Practise easy movement with deliberately low effort.', effort: 'RPE 2–3: very easy', total, required: ['warmup', 'main', 'cooldown'],
  steps: [timed('warmup', 5), timed('main', main), timed('cooldown', 5)], alternatives: ['Walk instead of running if the planned easy effort cannot be maintained.'],
});

/** Full original workout library. Every timed step is in whole minutes. */
export const beginner5kWorkoutLibrary: Record<Beginner5kTier, readonly CandidateSession[]> = {
  intro_walk_run: [
    walkRun('intro-standard', 28, 1, 6, 2, 6, 'Introduce short relaxed running intervals separated by walking.'),
    walkRun('intro-long', 31, 1, 7, 2, 7, 'Build time on feet without adding faster running.', 'long_run'),
    walkRun('intro-recovery', 25, 1, 5, 2, 5, 'Rehearse an easy repeatable run-walk pattern.'),
  ],
  build_walk_run: [
    walkRun('build-standard', 30, 2, 5, 2, 5, 'Extend relaxed running intervals while retaining full walking recovery.'),
    walkRun('build-long', 34, 2, 6, 2, 6, 'Build aerobic time on feet at an easy effort.', 'long_run'),
    walkRun('build-recovery', 30, 2, 5, 2, 5, 'Keep a lower-volume easy run-walk session.'),
  ],
  transition_walk_run: [
    walkRun('transition-standard', 30, 3, 4, 2, 4, 'Practise longer easy running intervals without changing effort.'),
    walkRun('transition-long', 40, 3, 6, 2, 6, 'Extend easy time on feet with planned walking breaks.', 'long_run'),
    walkRun('transition-recovery', 26, 2, 4, 2, 4, 'Use a deliberately lighter session before the longer day.'),
  ],
  continuous_run: [
    easyRun('continuous-easy', 30, 20, 'Build confidence sustaining an easy continuous run.'),
    easyRun('continuous-long', 40, 30, 'Extend aerobic running at a controlled conversational effort.', 'long_run'),
    recoveryRun('continuous-recovery', 25, 15),
  ],
};

function hasThreeSpacedDays(days: number[]): boolean {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length < 3) return false;
  return sorted.some((_, start) => {
    const selected = [sorted[start], sorted[(start + 1) % sorted.length], sorted[(start + 2) % sorted.length]].sort((a, b) => a - b);
    return selected.every((day, index) => {
      const next = selected[(index + 1) % selected.length];
      return ((next - day + 7) % 7) >= 2;
    });
  });
}

/** Candidate eligibility is intentionally conservative and explicit about unknown facts. */
export function assessBeginner5kCandidate(facts: Beginner5kFacts): CandidateAssessment {
  if (facts.concern) return { kind: 'ineligible', issues: ['health_hold'] };
  if (facts.interruption === 'sustained') return { kind: 'ineligible', issues: ['needs_reassessment'] };
  if (facts.goalDistanceMeters !== 5000) return { kind: 'ineligible', issues: ['unsupported_goal'] };
  if (facts.interruption === 'unknown' || facts.comfortableDurationMinutes === null || facts.recentWeeklyMinutes === null || facts.longestRepeatableMinutes === null || facts.comfortableDurationMinutes < 20 || facts.longestRepeatableMinutes < 20) return { kind: 'ineligible', issues: ['insufficient_baseline'] };
  if (!hasThreeSpacedDays(facts.availableWeekdays) || facts.availableWeekdays.some((day) => (facts.minuteLimits[day] ?? 0) < 25)) return { kind: 'ineligible', issues: ['availability_incompatible'] };
  if (facts.daysUntilGoal !== null && facts.daysUntilGoal < 56) return { kind: 'ineligible', issues: ['goal_date_incompatible'] };
  if (!Number.isInteger(facts.weekNumber) || facts.weekNumber < 1 || facts.weekNumber > 8) return { kind: 'ineligible', issues: ['week_out_of_range'] };
  // A comfortable preference may hold one authored stage; a challenging
  // preference never advances beyond the authored calendar stage.
  const effectiveWeek = facts.difficultyPreference === 'comfortable' ? Math.max(1, facts.weekNumber - 1) : facts.weekNumber;
  // Week four deliberately returns to the introductory workload instead of
  // applying a percentage calculation. This is authored candidate content.
  const progression: Beginner5kTier = (['intro_walk_run', 'intro_walk_run', 'build_walk_run', 'intro_walk_run', 'build_walk_run', 'transition_walk_run', 'transition_walk_run', 'continuous_run'] as const)[effectiveWeek - 1];
  const base = facts.comfortableDurationMinutes >= 30 && facts.recentWeeklyMinutes >= 75 && facts.longestRepeatableMinutes >= 20 ? progression === 'intro_walk_run' ? 'build_walk_run' : progression : progression;
  const repeatWeek = facts.difficultyPreference === 'comfortable' && facts.weekNumber > 1;
  return { kind: 'eligible', tier: base, repeatWeek, reason: `Candidate ${base.replaceAll('_', ' ')} tier selected from reported four-week volume, repeatable duration, three spaced days, and preference. This is a draft development preview, not reviewed coaching advice.` };
}

/** Candidate missed-workout rule: no catch-up work; discomfort always wins. */
export function candidateWeekResponse(input: { missedSessions: number; harderThanExpectedSessions: number; concern: boolean; sustainedInterruption: boolean }): CandidateWeekResponse {
  if (input.concern) return 'health_hold';
  if (input.sustainedInterruption) return 'needs_reassessment';
  if (input.missedSessions > 0 || input.harderThanExpectedSessions > 0) return 'repeat_current_week';
  return 'maintain';
}

function policyRule(session: CandidateSession): PolicyWorkoutRule {
  return { id: session.id, type: session.type, purpose: session.purpose, allowedEfforts: [session.effort], durationMinutes: duration(session.total), distanceMeters: null, distanceSessionMinutes: null, requiredStepKinds: session.required, stepRules: session.steps };
}

/** Creates a bounded policy that Qwen may use for one draft seven-day preview. */
export function createBeginner5kCandidatePolicy(tier: Beginner5kTier): PersonalizedTrainingPolicy {
  const sessions = beginner5kWorkoutLibrary[tier];
  const weeklyMinutes = sessions.reduce((total, session) => total + session.total, 0);
  return {
    id: BEGINNER_5K_CANDIDATE_ID, version: BEGINNER_5K_CANDIDATE_VERSION, reviewed: false, reviewer: null, reviewDate: null, contentStatus: 'draft',
    minRunDays: 3, maxRunDays: 3, maxRunMinutes: weeklyMinutes, minimumRecoveryDays: 1, minLongRuns: 1, maxLongRuns: 1, paceTargetsAllowed: false,
    workoutRules: sessions.map(policyRule),
  };
}

export function candidateSessionsForTier(tier: Beginner5kTier): readonly CandidateSession[] { return beginner5kWorkoutLibrary[tier]; }
