import { buildFirst5kPersonalizationInput } from '@/application/systemAPlanningInput';
import { assessFitness } from '@/domain/assessment/assessFitness';
import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import { Beginner5kPersonalizationRegistry } from '@/domain/planning/beginner5kPersonalizationRegistry';
import { bundledBeginner5kPersonalizationPolicies, beginner5kContinuousCandidatePersonalizationPolicy, type Beginner5kPathway } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { bundledDraft5kProgramRegistry } from '@/domain/planning/draft5kProgramRegistry';
import { evaluateBeginner5kCandidateCompatibility, type Beginner5kCandidateEvidence } from '@/domain/planning/evaluateBeginner5kCandidateCompatibility';
import { selectBeginner5kPathway } from '@/domain/planning/selectBeginner5kPathway';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { normalizeRunnerConstraints, type NormalizedRunnerConstraints } from '@/domain/planning/runnerConstraints';
import { describeFrequencyCapability, evaluateScheduleFeasibility, type ScheduleFeasibilityResult } from '@/domain/planning/evaluateScheduleFeasibility';
import { asResearchOnly, type ResearchOnly } from './researchOnly';
import { beginner5kCalendarAvailability } from '@/domain/planning/beginner5kCalendarAvailability';

export type Experimental5kPreview = ResearchOnly<{
  kind: 'preview'; ownerId: string; inputFingerprint: string; strictProductionGate: ReturnType<typeof selectBeginner5kPathway>;
  candidateCompatibility: ReturnType<typeof evaluateBeginner5kCandidateCompatibility>;
  pathway: { id: string; version: string; label: string };
  constraints: NormalizedRunnerConstraints; scheduleAnchor: string; sessions: readonly First5kDraftSession[]; feasibility: Extract<ScheduleFeasibilityResult, { kind: 'feasible' }>;
  systemC: { valid: boolean; violations: readonly string[]; policyReferences: readonly string[] };
}>;

export type Experimental5kPreviewBlocked = ResearchOnly<{
  kind: 'blocked'; ownerId: string; inputFingerprint: string | null; strictProductionGate: ReturnType<typeof selectBeginner5kPathway> | null;
  constraints: NormalizedRunnerConstraints | null; feasibility: ScheduleFeasibilityResult | null; reasonCodes: readonly string[];
}>;

/** Reproducible research output with account identity removed. */
export function serializeExperimental5kPreview(value: Experimental5kPreview | Experimental5kPreviewBlocked): string { return JSON.stringify(value, (key, item) => key === 'ownerId' ? '[account-scoped]' : item, 2); }

/**
 * Research-only bridge from saved onboarding facts to the exact immutable
 * draft programmes. It deliberately preserves the strict production-gate
 * result and never creates a Plan, assignment, reminder, or activity log.
 */
export function createExperimental5kPreview(input: { ownerId: string; draft: FitnessAssessmentDraft; assessment: FitnessAssessmentResult | null; nowDate: string }): Experimental5kPreview | Experimental5kPreviewBlocked {
  const constraints = normalizeRunnerConstraints(input.draft);
  const fingerprint = assessFitness(input.draft, `${input.nowDate}T12:00:00.000Z`).inputFingerprint;
  if (!input.assessment || input.assessment.inputFingerprint !== fingerprint) {
    return blocked(input.ownerId, fingerprint, null, constraints, null, ['assessment_missing_or_outdated']);
  }
  const registry = new Beginner5kPersonalizationRegistry(bundledBeginner5kPersonalizationPolicies);
  const strictInput = buildFirst5kPersonalizationInput(input.draft);
  const policyReference = { policyId: beginner5kContinuousCandidatePersonalizationPolicy.policyId, version: beginner5kContinuousCandidatePersonalizationPolicy.version };
  const strictProductionGate = selectBeginner5kPathway(registry, policyReference, strictInput);
  if (constraints.goal.family !== 'first_5k_completion') return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, null, ['unsupported_policy_family']);
  // System A's general base-build classification is deliberately not a universal
  // 5K rejection: the immutable run/walk draft has its own lower-capacity entry
  // conditions. The assessment must still be current above; health,
  // interruption, evidence, scheduling, and exact pathway checks follow below.
  const pathway = resolveExactPathway(registry, input.draft.first5kExperience);
  if (!pathway) return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, null, ['no_explicit_pathway_for_experience']);
  const programme = bundledDraft5kProgramRegistry.resolve(pathway.workoutPolicyPack);
  if (!programme) return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, null, ['workout_policy_pack_unavailable']);
  if (describeFrequencyCapability(constraints.scheduling.availableDays.length).status === 'policy_gap') {
    const frequencyGap = evaluateScheduleFeasibility(programme, constraints);
    return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, frequencyGap, frequencyGap.kind === 'feasible' ? [] : frequencyGap.reasonCodes);
  }
  const candidateCompatibility = evaluateBeginner5kCandidateCompatibility(pathway, evidenceFromDraft(input.draft, input.nowDate, constraints), beginner5kCalendarAvailability);
  if (candidateCompatibility.outcome !== 'candidate_compatible_draft_only') return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, null, candidateCompatibility.reasonCodes);
  const feasibility = evaluateScheduleFeasibility(programme, constraints, beginner5kCalendarAvailability);
  if (feasibility.kind !== 'feasible') return blocked(input.ownerId, fingerprint, strictProductionGate, constraints, feasibility, feasibility.reasonCodes);
  return asResearchOnly({
    researchOnly: true, productionEligible: false, kind: 'preview', ownerId: input.ownerId, inputFingerprint: fingerprint,
    strictProductionGate, candidateCompatibility, pathway: { id: pathway.id, version: pathway.version, label: pathway.label },
    constraints, scheduleAnchor: constraints.scheduling.weekAnchor!, sessions: feasibility.simulation.sessions, feasibility,
    systemC: { valid: feasibility.validation.valid, violations: feasibility.validation.violations.map((item) => item.code), policyReferences: feasibility.validation.appliedPolicyReferences },
  });
}

function blocked(ownerId: string, inputFingerprint: string | null, strictProductionGate: ReturnType<typeof selectBeginner5kPathway> | null, constraints: NormalizedRunnerConstraints | null, feasibility: ScheduleFeasibilityResult | null, reasonCodes: readonly string[]): Experimental5kPreviewBlocked {
  return asResearchOnly({ researchOnly: true, productionEligible: false, kind: 'blocked', ownerId, inputFingerprint, strictProductionGate, constraints, feasibility, reasonCodes });
}

function resolveExactPathway(registry: Beginner5kPersonalizationRegistry, experience: FitnessAssessmentDraft['first5kExperience']): Beginner5kPathway | null {
  if (experience === 'unknown') return null;
  const policy = registry.resolvePolicy({ policyId: beginner5kContinuousCandidatePersonalizationPolicy.policyId, version: beginner5kContinuousCandidatePersonalizationPolicy.version });
  if (policy.kind === 'unavailable') return null;
  return policy.policy.pathways.find((item) => item.supportedExperience.includes(experience)) ?? null;
}

/** Stable pathway identity for prepared-candidate matching, without generating a calendar. */
export function beginner5kPathwayForExperience(experience: FitnessAssessmentDraft['first5kExperience']): Pick<Beginner5kPathway, 'id' | 'version'> | null {
  const registry = new Beginner5kPersonalizationRegistry(bundledBeginner5kPersonalizationPolicies);
  const pathway = resolveExactPathway(registry, experience);
  return pathway ? { id: pathway.id, version: pathway.version } : null;
}

function evidenceFromDraft(draft: FitnessAssessmentDraft, nowDate: string, constraints: NormalizedRunnerConstraints): Beginner5kCandidateEvidence {
  const numeric = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };
  return {
    adultAgeConfirmed: draft.adultAgeConfirmed, canWalk30MinutesComfortably: draft.canWalk30MinutesComfortably,
    healthConcern: draft.healthConcern || draft.interruption === 'health_related', interruption: draft.interruption,
    planStartDate: constraints.scheduling.weekAnchor, availableDays: [...draft.trainingDays],
    weekdayMinuteLimits: Object.fromEntries(draft.trainingDays.map((day) => [day, numeric(draft.minuteLimits[day] ?? '')])),
    continuousRunMinutes: numeric(draft.comfortableRunMinutes), weeklyRunningMinutes: numeric(draft.weeklyMinutes),
    longestRecentSessionMinutes: numeric(draft.longestSessionMinutes), historyAgeDays: null,
    longestSessionAgeDays: ageDays(draft.longestSessionDate, nowDate),
  };
}

function ageDays(observed: string, nowDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed) || !/^\d{4}-\d{2}-\d{2}$/.test(nowDate)) return null;
  return Math.max(0, Math.floor((Date.parse(`${nowDate}T00:00:00Z`) - Date.parse(`${observed}T00:00:00Z`)) / 86_400_000));
}
