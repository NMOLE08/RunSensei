import type { NormalizedCoachingEvidence } from './evidence';
import { evaluateCoachingEvidence } from './evaluateEvidence';

export type ResearchIntensityDecision = Readonly<{
  researchOnly: true; evidenceIdentity: string;
  observed: Readonly<{ runningStyle: NormalizedCoachingEvidence['context']['runningStyle']; talkTest: NormalizedCoachingEvidence['context']['talkTest']; usualEffort: NormalizedCoachingEvidence['context']['usualEffort'] }>;
  guidance: { state: 'not_evaluated'; reasonCodes: readonly string[] };
  pace: { state: 'uncalibrated'; reasonCodes: readonly string[] };
  qualityWork: { state: 'not_evaluated' | 'withheld'; reasonCodes: readonly string[] };
  limitations: readonly string[];
}>;

/** Observation only; no workout structure or numerical intensity is produced. */
export function evaluateResearchIntensity(evidence: NormalizedCoachingEvidence): ResearchIntensityDecision {
  const evaluated = evaluateCoachingEvidence(evidence);
  const limitations: string[] = [];
  if (evidence.context.status !== 'currently_training') limitations.push('not_currently_training');
  if (evidence.context.talkTest === 'not_sure_or_not_applicable') limitations.push('talk_test_unknown');
  if (evidence.context.usualEffort === 'not_sure_or_not_applicable') limitations.push('usual_effort_unknown');
  if (evidence.performance.suitability === 'non_maximal') limitations.push('performance_non_maximal');
  if (evidence.performance.suitability === 'incomplete') limitations.push('performance_incomplete');
  limitations.push(...evaluated.issues.map(item => item.code));
  return {
    researchOnly: true, evidenceIdentity: evidence.identity,
    observed: { runningStyle: evidence.context.runningStyle, talkTest: evidence.context.talkTest, usualEffort: evidence.context.usualEffort },
    guidance: { state: 'not_evaluated', reasonCodes: ['reviewed_effort_guidance_unavailable'] },
    pace: { state: 'uncalibrated', reasonCodes: ['reviewed_pace_calibration_unavailable'] },
    qualityWork: { state: evaluated.state === 'held' || evaluated.state === 'review_required' ? 'withheld' : 'not_evaluated', reasonCodes: evaluated.state === 'held' || evaluated.state === 'review_required' ? evaluated.issues.map(item => item.code) : ['reviewed_quality_policy_unavailable'] },
    limitations,
  };
}
