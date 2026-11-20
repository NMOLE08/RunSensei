import type { Beginner5kRunnerEvidence } from './beginner5kRunnerEvidence';
import type { SessionCompatibility, StartingWorkloadComparison, WorkloadCandidate } from './beginner5kStartingWorkload';

export type PolicyReadinessStatus =
  | 'health_hold'
  | 'integrity_conflict'
  | 'episode_uncertain'
  | 'measurement_evidence_missing'
  | 'session_evidence_missing'
  | 'policy_authorization_missing'
  | 'calculation_available';

export type PolicyReadinessRevisionIdentity = {
  weeklyConfirmations: readonly string[];
  trainingEpisode: string;
};

export type CalculationReadiness = {
  method: WorkloadCandidate['method'];
  status: PolicyReadinessStatus;
  calculationAvailable: boolean;
  calculatedRunningSeconds: number | null;
  formula: string;
  formulaId: string;
  currentEvidenceStatus: 'confirmed_current' | 'unconfirmed_or_historical';
  repeatabilityStatus: 'not_established' | 'explicit_bout_evidence_present';
  reasonCodes: string[];
  explanations: string[];
  evidenceIdsUsed: string[];
  evidenceExcluded: { id: string; reason: string }[];
  limitations: string[];
  requiredEvidence: string[];
  policyReference: string;
  ruleIds: string[];
  prescriptionAuthorized: false;
};

export type SessionReadiness = {
  method: WorkloadCandidate['method'];
  status: 'not_evaluated' | SessionCompatibility['status'];
  calculationAvailable: boolean;
  continuousRunningSeconds: number | null;
  repeatabilityStatus: 'not_required' | 'missing' | 'present_but_rule_unreviewed';
  modeledSessions: SessionCompatibility['modeledSessions'];
  scheduleDates: string[];
  confirmedTimeLimits: { weekday: number; maxSeconds: number | null }[];
  reasonCodes: string[];
  explanations: string[];
  requiredEvidence: string[];
  missingPolicyConditions: string[];
  policyReference: string;
  ruleIds: string[];
  prescriptionAuthorized: false;
};

export type Beginner5kPolicyReadiness = {
  researchOnly: true;
  productionEligible: false;
  prescriptionAuthorized: false;
  overallStatus: PolicyReadinessStatus;
  reasonCodes: string[];
  explanations: string[];
  evidenceFingerprint: string;
  revisionIdentity: PolicyReadinessRevisionIdentity;
  trainingEpisode: { id: string | null; revision: number | null; status: 'current' | 'unknown'; startedOn: string | null };
  weeklyCoverage: { weekNumber: number; start: string; end: string; coverage: string; revisionIdentity: string | null }[];
  calculations: CalculationReadiness[];
  sessionCompatibility: SessionReadiness[];
  policyReferences: { reference: string; ruleIds: string[] }[];
};

export type Beginner5kPolicyReadinessInput = {
  evidence: Beginner5kRunnerEvidence;
  comparison: StartingWorkloadComparison;
  evidenceFingerprint: string;
  revisionIdentity?: PolicyReadinessRevisionIdentity;
  policyReferences: readonly string[];
  performanceSignals?: readonly { evidenceId: string; status: string; difficulty: string | null; fatigue: string | null; discomfort: string | null }[];
};

const integrityCodes = new Set([
  'account_mismatch','account_or_goal_mismatch','ledger_context_mismatch','invalid_calendar_or_timezone',
  'invalid_aggregate_duration','noncomparable_week_windows','conflicting_coverage','duplicate_activity_association',
  'linked_activity_date_disagreement','linked_elapsed_disagreement','invalid_outcome_lineage','conflicting_outcome_versions',
  'running_duration_exceeds_total_duration','zero_week_conflicts_with_activity',
]);
const episodeCodes = new Set(['current_uninterrupted_episode_required','training_episode_boundary_unknown','post_break_current_evidence_required']);
const sessionCodes = new Set([
  'confirmed_continuous_capacity_required','accumulated_session_evidence_missing','accumulated_session_exceeds_observed_running',
  'repeatable_bout_evidence_and_compatibility_rule_required','continuous_session_exceeds_capacity',
]);
const policyCodes = new Set([
  'comparison_policy_version_unavailable','exact_policy_version_unavailable','accumulated_session_compatibility_policy_unreviewed',
  'adjacent_actual_session_recovery_requires_review','repeatable_bout_evidence_present_compatibility_rule_unreviewed','difficult_workout_has_no_starting_workload_rule',
]);

function unique(values: readonly string[]): string[] { return [...new Set(values)]; }

function precedence(evidence: Beginner5kRunnerEvidence, reasons: readonly string[], available: boolean): PolicyReadinessStatus {
  if (evidence.foundation.healthConcern || evidence.foundation.healthRelatedInterruption || reasons.some(reason => reason.includes('health_hold') || reason === 'health_concern_reported' || reason === 'unusual_fatigue_requires_review')) return 'health_hold';
  if (reasons.some(reason => integrityCodes.has(reason))) return 'integrity_conflict';
  if (evidence.interruption || reasons.some(reason => episodeCodes.has(reason))) return 'episode_uncertain';
  if (!available) return 'measurement_evidence_missing';
  if (reasons.some(reason => sessionCodes.has(reason))) return 'session_evidence_missing';
  if (reasons.some(reason => policyCodes.has(reason))) return 'policy_authorization_missing';
  return 'calculation_available';
}

function explanation(reason: string, comparison: StartingWorkloadComparison): string {
  const exact: Record<string,string> = {
    health_hold: 'A health-related concern takes precedence over workload calculations.',
    health_hold_no_prescription: 'A health-related concern prevents prescription authorization.',
    current_uninterrupted_episode_required: 'The current training episode boundary has not been confirmed, or an interruption remains unresolved.',
    training_episode_boundary_unknown: 'Current and historical running evidence cannot yet be separated by an explicitly confirmed episode boundary.',
    confirmed_current_running_report_required: 'A current, explicitly confirmed weekly running-time report is required.',
    four_complete_consecutive_weeks_required: 'Four complete, consecutive runner-local observation weeks are required.',
    noncomparable_week_windows: 'The observation weeks do not have comparable runner-local date windows.',
    confirmed_continuous_capacity_required: 'Current continuous-running capacity is required before session compatibility can be evaluated.',
    repeatable_bout_evidence_and_compatibility_rule_required: 'Weekly running time is available, but repeatable run/walk interval capacity is unknown and its compatibility rule is not authored.',
    repeatable_bout_evidence_present_compatibility_rule_unreviewed: 'Repeatable interval evidence exists, but the rule authorizing its use is still unreviewed.',
    accumulated_session_evidence_missing: 'No comparable accumulated running-session evidence is available.',
    accumulated_session_compatibility_policy_unreviewed: 'The accumulated-session compatibility condition is still an unreviewed policy candidate.',
    adjacent_actual_session_recovery_requires_review: 'Recovery spacing against recent actual sessions still requires reviewed authorization.',
    health_concern_reported: 'A reported pain or injury concern requires review before any prescription decision.',
    unusual_fatigue_requires_review: 'Reported unusual fatigue requires review before any prescription decision.',
    difficult_workout_has_no_starting_workload_rule: 'Difficult-workout feedback is preserved, but this starting-workload policy does not authorize a response.',
    session_exceeds_time_limit: 'At least one modeled session exceeds the runner-confirmed daily time limit.',
    explicit_supported_frequency_required: 'An explicitly selected policy-supported frequency of two or three sessions is required.',
    report_and_history_differ_not_automatically_contradictory: 'The self-report and observed history differ; neither source is silently discarded or preferred.',
  };
  if (exact[reason]) return exact[reason];
  if (reason === 'four_complete_consecutive_weeks_required') return exact[reason]!;
  const week = comparison.ledger.weeks.findIndex(item => item.coverage === 'unknown' || item.coverage === 'partial');
  if (reason === 'incomplete_week' && week >= 0) return `Observed calculation unavailable: Week ${week+1} has ${comparison.ledger.weeks[week]!.coverage} coverage.`;
  return reason.replaceAll('_',' ');
}

function requiredEvidence(candidate: WorkloadCandidate, comparison: StartingWorkloadComparison): string[] {
  const required: string[] = [];
  if (candidate.reasons.includes('confirmed_current_running_report_required')) required.push('Explicitly confirmed current weekly running duration');
  if (candidate.reasons.includes('current_uninterrupted_episode_required') || comparison.ledger.issues.includes('training_episode_boundary_unknown')) required.push('Explicit current training-episode boundary');
  if (candidate.reasons.includes('four_complete_consecutive_weeks_required')) {
    comparison.ledger.weeks.forEach((week,index)=>{ if (!['complete','confirmed_no_running'].includes(week.coverage) || week.runningTotalSeconds === null) required.push(`Week ${index+1} (${week.start}–${week.end}): complete comparable running evidence or explicit no-running confirmation`); });
  }
  return unique(required);
}

function sessionReadiness(candidate: WorkloadCandidate, evidence: Beginner5kRunnerEvidence, comparison: StartingWorkloadComparison): SessionReadiness {
  const compatibility=candidate.compatibility;
  const reasons=unique(compatibility?.findings ?? (candidate.available ? ['session_compatibility_not_evaluated'] : ['calculation_required_before_session_compatibility']));
  const hasMultipleBouts=compatibility?.modeledSessions.some(session=>session.bouts>1) ?? false;
  const repeatabilityStatus: SessionReadiness['repeatabilityStatus'] = !hasMultipleBouts ? 'not_required' : reasons.includes('repeatable_bout_evidence_present_compatibility_rule_unreviewed') ? 'present_but_rule_unreviewed' : 'missing';
  const required: string[]=[];
  if (reasons.includes('confirmed_continuous_capacity_required')) required.push('Explicitly confirmed current continuous-running capacity');
  if (repeatabilityStatus==='missing') required.push('Explicit repeatable run/walk bout evidence');
  if (reasons.includes('accumulated_session_evidence_missing')) required.push('Comparable actual running duration from a current-episode session');
  const missingPolicy=unique(reasons.filter(reason=>policyCodes.has(reason) || reason.endsWith('_requires_review')));
  return {
    method:candidate.method,status:compatibility?.status ?? 'not_evaluated',calculationAvailable:candidate.available,
    continuousRunningSeconds:evidence.foundation.currentContinuousRunningSeconds,repeatabilityStatus,
    modeledSessions:compatibility?.modeledSessions ?? [],scheduleDates:compatibility?.scheduleDates ?? [],
    confirmedTimeLimits:evidence.constraints.availableDays.map(day=>({weekday:day.weekday,maxSeconds:day.confirmedByRunner&&day.maxMinutes!==null?day.maxMinutes*60:null})),
    reasonCodes:reasons,explanations:reasons.map(reason=>explanation(reason,comparison)),requiredEvidence:unique(required),missingPolicyConditions:missingPolicy,
    policyReference:compatibility?.policyReference ?? candidate.policyReference,ruleIds:['rules.frequency','rules.structure','rules.workload','rules.health'],prescriptionAuthorized:false,
  };
}

/** Explains evidence and policy readiness without selecting or authorizing a workload. */
export function evaluateBeginner5kPolicyReadiness(input: Beginner5kPolicyReadinessInput): Beginner5kPolicyReadiness {
  const revisionIdentity=input.revisionIdentity ?? {weeklyConfirmations:[],trainingEpisode:'none'};
  const episodeParts=revisionIdentity.trainingEpisode.split(':');
  const episodeStatus=episodeParts[2]==='current'?'current':'unknown';
  const episodeRevision=Number(episodeParts[1]);
  const episodeStart=episodeStatus==='current'&&episodeParts[3]&&episodeParts[3]!=='unknown'?episodeParts[3]:null;
  const signalReasons=unique((input.performanceSignals??[]).flatMap(signal=>signal.discomfort==='pain_or_injury_concern'?['health_concern_reported']:signal.fatigue==='unusual'?['unusual_fatigue_requires_review']:signal.difficulty==='too_difficult'||signal.difficulty==='challenging'?['difficult_workout_has_no_starting_workload_rule']:[]));
  const calculations=input.comparison.candidates.map(candidate=>{
    const reasons=unique([...candidate.reasons,...input.comparison.findings,...input.evidence.issues,...input.comparison.ledger.issues,...input.comparison.ledger.weeks.flatMap(week=>week.issues),...signalReasons]);
    if (!candidate.available && candidate.method!=='confirmed_report' && input.comparison.ledger.weeks.some(week=>week.coverage==='unknown'||week.coverage==='partial')) reasons.push('incomplete_week');
    return {
      method:candidate.method,status:precedence(input.evidence,reasons,candidate.available),calculationAvailable:candidate.available,
      calculatedRunningSeconds:candidate.runningSeconds,formula:candidate.formula,formulaId:candidate.formulaId,
      currentEvidenceStatus:input.evidence.foundation.currentEvidenceConfirmed?'confirmed_current':'unconfirmed_or_historical',
      repeatabilityStatus:candidate.compatibility?.findings.includes('repeatable_bout_evidence_present_compatibility_rule_unreviewed')?'explicit_bout_evidence_present':'not_established',
      reasonCodes:unique(reasons),explanations:reasons.length?unique(reasons.map(reason=>explanation(reason,input.comparison))):['Calculation available; prescription not authorized.'],evidenceIdsUsed:unique([...candidate.evidenceIds,...(input.performanceSignals??[]).map(signal=>signal.evidenceId)]),evidenceExcluded:[...candidate.exclusions],
      limitations:[...candidate.uncertainty],requiredEvidence:requiredEvidence(candidate,input.comparison),policyReference:candidate.policyReference,ruleIds:[candidate.formulaId],prescriptionAuthorized:false as const,
    } satisfies CalculationReadiness;
  });
  const allReasons=unique(calculations.flatMap(item=>item.reasonCodes).concat(input.comparison.candidates.flatMap(candidate=>candidate.compatibility?.findings ?? [])));
  const overallStatus=precedence(input.evidence,allReasons,calculations.some(item=>item.calculationAvailable));
  return {
    researchOnly:true,productionEligible:false,prescriptionAuthorized:false,overallStatus,reasonCodes:allReasons,
    explanations:unique(allReasons.map(reason=>explanation(reason,input.comparison))),evidenceFingerprint:input.evidenceFingerprint,revisionIdentity,
    trainingEpisode:{id:episodeStatus==='current'?'current-training-episode':null,revision:Number.isSafeInteger(episodeRevision)?episodeRevision:null,status:episodeStatus,startedOn:episodeStart},
    weeklyCoverage:input.comparison.ledger.weeks.map((week,index)=>({weekNumber:index+1,start:week.start,end:week.end,coverage:week.coverage,revisionIdentity:revisionIdentity.weeklyConfirmations.find(identity=>identity.startsWith(`${week.start}:`))??null})),
    calculations,sessionCompatibility:input.comparison.candidates.map(candidate=>sessionReadiness(candidate,input.evidence,input.comparison)),
    policyReferences:unique(input.policyReferences).map(reference=>({reference,ruleIds:reference===input.comparison.policyReference?input.comparison.candidates.map(candidate=>candidate.formulaId):['rules.entry','rules.frequency','rules.structure','rules.health']})),
  };
}
