import type { NormalizedCoachingEvidence, EvidenceIssue } from './evidence';

export type CoachingEvidenceEvaluation = Readonly<{ identity: string; state: 'usable_for_research' | 'review_required' | 'held'; issues: readonly EvidenceIssue[] }>;

export function evaluateCoachingEvidence(evidence: NormalizedCoachingEvidence): CoachingEvidenceEvaluation {
  const issues = [...evidence.issues];
  if (evidence.context.healthConcern || evidence.context.interruption === 'health_related' || evidence.context.interruptionReason === 'illness_or_injury') issues.push({ code: 'existing_health_hold', fields: ['healthConcern', 'interruption', 'interruptionReason'] });
  else if (evidence.context.interruption === 'over_four_weeks') issues.push({ code: 'existing_reassessment_hold', fields: ['interruption'] });
  for (const [field, fact] of [['weeklyMinutes', evidence.weeklyMinutes], ['weeklyDistance', evidence.weeklyDistance], ['longestSessionMinutes', evidence.longestMinutes], ['longestSessionDistance', evidence.longestDistance], ['comfortableRunMinutes', evidence.comfortableMinutes]] as const) {
    if (fact.state === 'invalid') issues.push({ code: `${field}_invalid`, fields: fact.fields });
  }
  if (evidence.weeklyMinutes.state === 'missing' && evidence.weeklyDistance.state === 'missing') issues.push({ code: 'weekly_running_missing', fields: ['weeklyMinutes', 'weeklyDistance'] });
  const held = issues.some(item => item.code === 'existing_health_hold' || item.code === 'existing_reassessment_hold');
  return { identity: evidence.identity, state: held ? 'held' : issues.length ? 'review_required' : 'usable_for_research', issues };
}
