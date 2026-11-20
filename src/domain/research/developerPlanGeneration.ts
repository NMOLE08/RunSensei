import { bundledBeginner5kPersonalizationPolicies, beginner5kContinuousCandidatePersonalizationPolicy, type Beginner5kPathway, type ImmutablePolicyReference } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { Beginner5kPersonalizationRegistry } from '@/domain/planning/beginner5kPersonalizationRegistry';
import { selectBeginner5kPathway, type Beginner5kPersonalizationInput, type First5kExperience } from '@/domain/planning/selectBeginner5kPathway';
import { evaluateBeginner5kCandidateCompatibility, type Beginner5kCandidateEvidence } from '@/domain/planning/evaluateBeginner5kCandidateCompatibility';
import { bundledDraft5kProgramRegistry } from '@/domain/planning/draft5kProgramRegistry';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { asResearchOnly, type ResearchOnly } from './researchOnly';

export type DeveloperPlanRawInput = {
  requestedGoal: 'first_5k_completion' | 'other' | 'unknown';
  goalFocus: 'completion' | 'target_time' | 'unknown';
  targetDistance: '5k' | '10k' | 'half_marathon' | 'marathon' | 'unknown';
  adultAgeConfirmed: boolean | null;
  canWalk30MinutesComfortably: boolean | null;
  experience: First5kExperience;
  healthConcern: boolean | null;
  interruption: Beginner5kCandidateEvidence['interruption'];
  continuousRunMinutes: string;
  weeklyRunningMinutes: string;
  longestRecentSessionMinutes: string;
  historyAgeDays: string;
  longestSessionAgeDays: string;
  planStartDate: string;
  goalMode: 'fixed_date' | 'flexible';
  goalDate: string;
  availableDays: readonly number[];
  weekdayMinuteLimits: Readonly<Record<number, string>>;
  preferredDays: readonly number[];
  preferredLongRunDay: number | null;
  targetPerformance: string;
  performanceDate: string;
  trainingPreference: 'comfortable' | 'balanced' | 'challenging';
};

export type DeveloperPlanNormalizedInput = Omit<DeveloperPlanRawInput, 'continuousRunMinutes' | 'weeklyRunningMinutes' | 'longestRecentSessionMinutes' | 'historyAgeDays' | 'longestSessionAgeDays' | 'weekdayMinuteLimits'> & {
  continuousRunMinutes: number | null;
  weeklyRunningMinutes: number | null;
  longestRecentSessionMinutes: number | null;
  historyAgeDays: number | null;
  longestSessionAgeDays: number | null;
  weekdayMinuteLimits: Readonly<Record<number, number | null>>;
};

export type DeveloperInputEffect = 'eligibility' | 'pathway_selection' | 'scheduling' | 'workout_structure' | 'nothing_currently';
export type DeveloperInputTrace = { field: keyof DeveloperPlanRawInput; effects: readonly DeveloperInputEffect[]; explanation: string };
export type DeveloperPlanGenerationAttempt = ResearchOnly<{
  schemaVersion: 'runsensei-developer-plan-attempt-v1';
  testId: string;
  generatedAt: string;
  rawInput: DeveloperPlanRawInput;
  normalizedInput: DeveloperPlanNormalizedInput;
  inputTrace: readonly DeveloperInputTrace[];
  strictGate: ReturnType<typeof selectBeginner5kPathway>;
  candidateCompatibility: ReturnType<typeof evaluateBeginner5kCandidateCompatibility> | null;
  selection: { kind: 'selected_for_research' | 'rejected'; reasonCodes: readonly string[]; policyReference: ImmutablePolicyReference; pathway: { id: string; version: string; label: string } | null };
  plan: { sessions: readonly First5kDraftSession[]; policyReferences: readonly string[]; weekly: readonly DeveloperPlanWeekSummary[] } | null;
  systemC: { valid: boolean; violations: readonly string[]; policyReferences: readonly string[] } | null;
  warnings: readonly string[];
  failureReasons: readonly string[];
}>;

export type DeveloperPlanWeekSummary = { week: number; dates: readonly string[]; trainingDays: readonly number[]; totalWorkoutSeconds: number | null; runningSeconds: number | null; longestContinuousRunSeconds: number | null; recoveryWeek: boolean; final5kEvent: boolean };
export type DeveloperPlanComparisonEntry = {
  slot: string;
  inputSummary: { experience: First5kExperience; continuousRunMinutes: number | null; weeklyRunningMinutes: number | null; longestRecentSessionMinutes: number | null; startDate: string; availableDays: readonly number[] };
  selection: DeveloperPlanGenerationAttempt['selection'];
  validation: DeveloperPlanGenerationAttempt['systemC'];
  failureReasons: readonly string[];
  policyReferences: readonly string[];
  weekly: readonly DeveloperPlanWeekSummary[];
  sameWorkoutPrescriptionAsFirstGeneratedPlan: boolean | null;
};

/** Keeps export construction deterministic and independently testable from the device share sheet. */
export function serializeDeveloperPlanAttempt(attempt: DeveloperPlanGenerationAttempt): string {
  return JSON.stringify(attempt, null, 2);
}

export function developerPlanExportFilename(label: 'A' | 'B' | 'C', testId: string): string {
  const safe = testId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'attempt';
  return `runsensei-research-plan-${label}-${safe}.json`;
}

/** Compares immutable snapshots without treating a date-only shift as a prescription change. */
export function compareDeveloperPlanAttempts(entries: readonly { slot: string; attempt: DeveloperPlanGenerationAttempt }[]): readonly DeveloperPlanComparisonEntry[] {
  const firstGenerated = entries.find((entry) => entry.attempt.plan !== null)?.attempt.plan ?? null;
  return entries.map(({ slot, attempt }) => ({
    slot,
    inputSummary: { experience: attempt.normalizedInput.experience, continuousRunMinutes: attempt.normalizedInput.continuousRunMinutes, weeklyRunningMinutes: attempt.normalizedInput.weeklyRunningMinutes, longestRecentSessionMinutes: attempt.normalizedInput.longestRecentSessionMinutes, startDate: attempt.normalizedInput.planStartDate, availableDays: attempt.normalizedInput.availableDays },
    selection: attempt.selection,
    validation: attempt.systemC,
    failureReasons: attempt.failureReasons,
    policyReferences: attempt.plan?.policyReferences ?? [],
    weekly: attempt.plan?.weekly ?? [],
    sameWorkoutPrescriptionAsFirstGeneratedPlan: attempt.plan && firstGenerated ? samePrescription(attempt.plan.sessions, firstGenerated.sessions) : null,
  }));
}

export const developerPlanPolicyReference: ImmutablePolicyReference = {
  policyId: beginner5kContinuousCandidatePersonalizationPolicy.policyId,
  version: beginner5kContinuousCandidatePersonalizationPolicy.version,
};

/**
 * Pure research-only plan attempt. It records the strict gate before using a
 * draft candidate evaluator, and never creates an activatable plan.
 */
export function generateDeveloperPlanAttempt(input: DeveloperPlanRawInput, metadata: { testId: string; generatedAt: string }): DeveloperPlanGenerationAttempt {
  const rawSnapshot = snapshotRawInput(input);
  const normalizedInput = normalizeDeveloperPlanInput(rawSnapshot);
  const registry = new Beginner5kPersonalizationRegistry(bundledBeginner5kPersonalizationPolicies);
  const strictInput = toStrictInput(normalizedInput);
  const strictGate = selectBeginner5kPathway(registry, developerPlanPolicyReference, strictInput);
  const trace = inputTrace();
  const pathway = resolveResearchPathway(registry, normalizedInput.experience);
  if (!pathway) return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, null, null, null, null, ['experience_has_no_explicit_draft_pathway']);

  const candidateEvidence = toCandidateEvidence(normalizedInput);
  const candidateCompatibility = evaluateBeginner5kCandidateCompatibility(pathway, candidateEvidence);
  if (candidateCompatibility.outcome !== 'candidate_compatible_draft_only') {
    return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, candidateCompatibility, pathway, null, null, candidateCompatibility.reasonCodes);
  }

  const program = bundledDraft5kProgramRegistry.resolve(pathway.workoutPolicyPack);
  if (!program) return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, candidateCompatibility, pathway, null, null, ['workout_policy_pack_unavailable']);
  const simulation = program.simulate(normalizedInput.planStartDate, [...normalizedInput.availableDays], false);
  if (simulation.kind === 'blocked') return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, candidateCompatibility, pathway, null, null, simulation.reasons);
  const safety = program.validate(simulation);
  const systemC = { valid: safety.valid, violations: safety.violations.map((item) => item.code), policyReferences: safety.appliedPolicyReferences };
  if (!safety.valid) return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, candidateCompatibility, pathway, null, systemC, systemC.violations);
  return result(metadata, rawSnapshot, normalizedInput, trace, strictGate, candidateCompatibility, pathway, { sessions: simulation.sessions, policyReferences: simulation.policyRefs, weekly: summarizeWeeks(simulation.sessions) }, systemC, []);
}

export function normalizeDeveloperPlanInput(input: DeveloperPlanRawInput): DeveloperPlanNormalizedInput {
  const limits = Object.fromEntries(Object.entries(input.weekdayMinuteLimits).map(([day, minutes]) => [Number(day), nonNegativeNumberOrNull(minutes)]));
  return {
    ...input,
    continuousRunMinutes: nonNegativeNumberOrNull(input.continuousRunMinutes),
    weeklyRunningMinutes: nonNegativeNumberOrNull(input.weeklyRunningMinutes),
    longestRecentSessionMinutes: nonNegativeNumberOrNull(input.longestRecentSessionMinutes),
    historyAgeDays: nonNegativeNumberOrNull(input.historyAgeDays),
    longestSessionAgeDays: nonNegativeNumberOrNull(input.longestSessionAgeDays),
    weekdayMinuteLimits: limits,
  };
}

export function inputTrace(): readonly DeveloperInputTrace[] {
  return [
    { field: 'adultAgeConfirmed', effects: ['eligibility'], explanation: 'Required by the draft policy and candidate compatibility check.' },
    { field: 'canWalk30MinutesComfortably', effects: ['eligibility'], explanation: 'Required by the draft policy; it is not medical clearance.' },
    { field: 'experience', effects: ['eligibility', 'pathway_selection'], explanation: 'Selects only an explicitly supported draft pathway.' },
    { field: 'healthConcern', effects: ['eligibility'], explanation: 'A reported concern blocks draft plan generation.' },
    { field: 'interruption', effects: ['eligibility'], explanation: 'Any reported interruption requires review under the draft policy.' },
    { field: 'continuousRunMinutes', effects: ['pathway_selection'], explanation: 'Used by the continuous-running draft compatibility check.' },
    { field: 'weeklyRunningMinutes', effects: ['pathway_selection'], explanation: 'Used only by the continuous-running draft compatibility check.' },
    { field: 'longestRecentSessionMinutes', effects: ['pathway_selection'], explanation: 'Used only by the continuous-running draft compatibility check.' },
    { field: 'historyAgeDays', effects: ['eligibility'], explanation: 'Checks whether supplied running-history evidence is current.' },
    { field: 'longestSessionAgeDays', effects: ['eligibility'], explanation: 'Checks whether supplied longest-session evidence is current.' },
    { field: 'planStartDate', effects: ['eligibility', 'scheduling'], explanation: 'Required and used to place the fixed twelve-week calendar.' },
    { field: 'availableDays', effects: ['scheduling'], explanation: 'Must contain an accepted three-day non-consecutive schedule.' },
    { field: 'weekdayMinuteLimits', effects: ['scheduling'], explanation: 'Each scheduled session must fit its selected weekday limit.' },
    { field: 'requestedGoal', effects: ['eligibility'], explanation: 'Only first-5K completion is supported by this draft policy.' },
    { field: 'goalFocus', effects: ['eligibility'], explanation: 'Only a completion goal is supported by this draft policy.' },
    { field: 'targetDistance', effects: ['nothing_currently'], explanation: 'Shown for comparison only; the current policy uses the supported first-5K goal instead.' },
    { field: 'goalMode', effects: ['nothing_currently'], explanation: 'Stored in this test attempt but does not alter fixed-pack generation.' },
    { field: 'goalDate', effects: ['nothing_currently'], explanation: 'Stored in this test attempt; goal-date compatibility is not authored for this generator.' },
    { field: 'preferredDays', effects: ['nothing_currently'], explanation: 'Recorded for comparison only; available days drive scheduling.' },
    { field: 'preferredLongRunDay', effects: ['nothing_currently'], explanation: 'The current fixed pack has no personalized long-run placement rule.' },
    { field: 'targetPerformance', effects: ['nothing_currently'], explanation: 'No pace or performance rule is authored for these draft pathways.' },
    { field: 'performanceDate', effects: ['nothing_currently'], explanation: 'No performance-based adjustment rule is authored for these draft pathways.' },
    { field: 'trainingPreference', effects: ['nothing_currently'], explanation: 'The current fixed draft pack does not change structure from a preference.' },
  ];
}

function result(metadata: { testId: string; generatedAt: string }, rawInput: DeveloperPlanRawInput, normalizedInput: DeveloperPlanNormalizedInput, trace: readonly DeveloperInputTrace[], strictGate: ReturnType<typeof selectBeginner5kPathway>, candidateCompatibility: ReturnType<typeof evaluateBeginner5kCandidateCompatibility> | null, pathway: Beginner5kPathway | null, plan: DeveloperPlanGenerationAttempt['plan'], systemC: DeveloperPlanGenerationAttempt['systemC'], failureReasons: readonly string[]): DeveloperPlanGenerationAttempt {
  const selected = pathway !== null && plan !== null;
  return asResearchOnly({
    researchOnly: true,
    productionEligible: false,
    schemaVersion: 'runsensei-developer-plan-attempt-v1',
    testId: metadata.testId,
    generatedAt: metadata.generatedAt,
    rawInput,
    normalizedInput,
    inputTrace: trace,
    strictGate,
    candidateCompatibility,
    selection: { kind: selected ? 'selected_for_research' : 'rejected', reasonCodes: selected ? ['candidate_compatible_draft_only'] : failureReasons, policyReference: developerPlanPolicyReference, pathway: pathway ? { id: pathway.id, version: pathway.version, label: pathway.label } : null },
    plan,
    systemC,
    warnings: ['research_only_not_approved_coaching', 'strict_production_gate_remains_blocked'],
    failureReasons,
  });
}

function resolveResearchPathway(registry: Beginner5kPersonalizationRegistry, experience: First5kExperience): Beginner5kPathway | null {
  if (experience === 'unknown') return null;
  const resolved = registry.resolvePolicy(developerPlanPolicyReference);
  if (resolved.kind === 'unavailable') return null;
  return resolved.policy.pathways.find((candidate) => candidate.supportedExperience.includes(experience)) ?? null;
}

function toStrictInput(input: DeveloperPlanNormalizedInput): Beginner5kPersonalizationInput {
  return { adultAgeConfirmed: input.adultAgeConfirmed, canWalk30MinutesComfortably: input.canWalk30MinutesComfortably, experience: input.experience, healthConcern: input.healthConcern, interruption: input.interruption, goal: input.requestedGoal, goalFocus: input.goalFocus, planStartDate: input.planStartDate || null, availableDays: input.availableDays, continuousRunMinutes: input.continuousRunMinutes, weeklyRunningMinutes: input.weeklyRunningMinutes, weeklyDistance: null, longestRecentSessionMinutes: input.longestRecentSessionMinutes, weekdayMinuteLimits: input.weekdayMinuteLimits };
}

function toCandidateEvidence(input: DeveloperPlanNormalizedInput): Beginner5kCandidateEvidence {
  return { adultAgeConfirmed: input.adultAgeConfirmed, canWalk30MinutesComfortably: input.canWalk30MinutesComfortably, healthConcern: input.healthConcern, interruption: input.interruption, planStartDate: input.planStartDate || null, availableDays: input.availableDays, weekdayMinuteLimits: input.weekdayMinuteLimits, continuousRunMinutes: input.continuousRunMinutes, weeklyRunningMinutes: input.weeklyRunningMinutes, longestRecentSessionMinutes: input.longestRecentSessionMinutes, historyAgeDays: input.historyAgeDays, longestSessionAgeDays: input.longestSessionAgeDays };
}

function nonNegativeNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function snapshotRawInput(input: DeveloperPlanRawInput): DeveloperPlanRawInput {
  return { ...input, availableDays: [...input.availableDays], preferredDays: [...input.preferredDays], weekdayMinuteLimits: { ...input.weekdayMinuteLimits } };
}

function summarizeWeeks(sessions: readonly First5kDraftSession[]): readonly DeveloperPlanWeekSummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const week = index + 1;
    const rows = sessions.filter((session) => session.week === week);
    const timed = rows.every((session) => session.durationSeconds !== null);
    const runningSteps = rows.flatMap((session) => session.steps.filter((step) => step.kind === 'run'));
    return {
      week,
      dates: rows.map((session) => session.date),
      trainingDays: rows.map((session) => new Date(`${session.date}T00:00:00Z`).getUTCDay()),
      totalWorkoutSeconds: timed ? rows.reduce((total, session) => total + (session.durationSeconds ?? 0), 0) : null,
      runningSeconds: rows.some((session) => session.steps.some((step) => step.kind === 'event')) ? null : runningSteps.reduce((total, step) => total + (step.seconds ?? 0) * step.repeats, 0),
      longestContinuousRunSeconds: runningSteps.length ? Math.max(...runningSteps.map((step) => (step.seconds ?? 0))) : null,
      recoveryWeek: week === 4 || week === 8,
      final5kEvent: rows.some((session) => session.distanceMeters === 5000),
    };
  });
}

function samePrescription(left: readonly First5kDraftSession[], right: readonly First5kDraftSession[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((session, index) => {
    const candidate = right[index];
    return candidate !== undefined && session.week === candidate.week && session.code === candidate.code && session.durationSeconds === candidate.durationSeconds && session.distanceMeters === candidate.distanceMeters && JSON.stringify(session.steps) === JSON.stringify(candidate.steps);
  });
}
