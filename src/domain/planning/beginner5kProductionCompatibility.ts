import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { beginner5kContinuousCandidatePersonalizationPolicy } from './beginner5kPersonalizationPolicy';
import { evaluateBeginner5kCandidateCompatibility } from './evaluateBeginner5kCandidateCompatibility';
import { beginner5kCalendarAvailability } from './beginner5kCalendarAvailability';
import type { Experimental5kPreview } from '@/domain/research/experimental5kPreview';
import { requiredBeginner5kPublicationReferences } from './beginner5kPublicationPolicy';
import { isVerifiedPolicyRelease, type VerifiedPolicyRelease } from './verifyPolicyRelease';
import { runnerLocalDate } from './beginner5kRunnerEvidence';

/** Separate successor adapter: the historical selector and draft evaluator remain unchanged. */
export function evaluateBeginner5kProductionCompatibility(draft: FitnessAssessmentDraft, preview: Experimental5kPreview, release: VerifiedPolicyRelease | undefined, now: string) {
  const blocked = (reasonCodes: readonly string[]) => ({ kind: 'blocked' as const, reasonCodes });
  if (!isVerifiedPolicyRelease(release, requiredBeginner5kPublicationReferences(preview), now)) return blocked(['workload_compatibility_release_required']);
  if (draft.goal !== '5k' || draft.goalFocus !== 'finish') return blocked(['goal_not_supported']);
  if (draft.healthConcern || draft.interruption === 'health_related') return blocked(['health_concern_reported']);
  const today = runnerLocalDate(now, draft.timezone);
  if (!today) return blocked(['invalid_evidence_timezone_or_evaluation_date']);
  const dates = { weeklyEvidenceConfirmedAt: draft.weeklyEvidenceConfirmedAt, currentCapabilityConfirmedAt: draft.currentCapabilityConfirmedAt, longestSessionDate: draft.longestSessionDate };
  const missing = Object.entries(dates).filter(([,date]) => !isDateOnly(date) || date > today).map(([field]) => `invalid_or_missing_${field}`);
  if (missing.length) return blocked(missing);
  const age = (date: string) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
  const numeric = (s: string) => s.trim() && Number.isFinite(Number(s)) ? Number(s) : null;
  const experience = draft.first5kExperience;
  if (experience === 'unknown') return blocked(['missing_first_5k_experience']);
  const pathway = beginner5kContinuousCandidatePersonalizationPolicy.pathways.find(p => p.id === preview.pathway.id && p.version === preview.pathway.version && p.supportedExperience.includes(experience));
  if (!pathway) return blocked(['exact_pathway_unavailable']);
  const result = evaluateBeginner5kCandidateCompatibility(pathway, {
    adultAgeConfirmed: draft.adultAgeConfirmed, canWalk30MinutesComfortably: draft.canWalk30MinutesComfortably,
    healthConcern: draft.healthConcern, interruption: draft.interruption, planStartDate: preview.scheduleAnchor,
    availableDays: draft.trainingDays, weekdayMinuteLimits: {}, continuousRunMinutes: numeric(draft.comfortableRunMinutes),
    weeklyRunningMinutes: numeric(draft.weeklyMinutes), longestRecentSessionMinutes: numeric(draft.longestSessionMinutes),
    historyAgeDays: Math.max(age(draft.weeklyEvidenceConfirmedAt), age(draft.currentCapabilityConfirmedAt)), longestSessionAgeDays: age(draft.longestSessionDate),
  }, beginner5kCalendarAvailability);
  if (result.outcome !== 'candidate_compatible_draft_only') return blocked(result.reasonCodes);
  return { kind: 'compatible_under_verified_release' as const, evaluatedRules: result.evaluatedRules, references: release.references };
}
