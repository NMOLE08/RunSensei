import proposal from '../../../PolicyPack/foundation/04_starting_workload_comparison_v0.1.0_draft.json';
import foundation from '../../../PolicyPack/foundation/02_multiweek_v0.2.0_draft.json';
import type { Beginner5kRunnerEvidence, WeeklyEvidenceLedger } from './beginner5kRunnerEvidence';
import { buildWeeklyEvidenceLedger } from './beginner5kRunnerEvidence';
import { schedulePolicyWeek, type MultiDistanceTrainingPolicy, type PolicyWorkoutStep } from './multiDistancePolicy';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { addCalendarDays } from '@/domain/calendar/operations';

export const startingWorkloadProposalReference = `${proposal.policyId}@${proposal.version}`;
type Method = keyof typeof proposal.formulas;
export type SessionCompatibility = {
  status: 'unresolved' | 'conflict' | 'technically_fits'; findings: string[];
  modeledSessions: { slot: string; runningSeconds: number; walkingSeconds: number; totalSeconds: number; bouts: number }[];
  scheduleDates: string[]; conflicts: readonly unknown[];
  policyReference: string;
};
export type WorkloadCandidate = {
  method: Method; available: boolean; runningSeconds: number | null; formula: string; formulaId: string;
  inputs: { reportSeconds: number | null; weeklySeconds: (number | null)[]; numerator?: number; denominator?: number; medianSeconds?: number };
  unit: 'running_seconds'; evidenceIds: string[]; exclusions: { id: string; reason: string }[];
  uncertainty: string[]; reasons: string[]; policyReference: string;
  researchOnly: true; productionEligible: false; compatibility: SessionCompatibility | null;
};
export type StartingWorkloadComparison = {
  researchOnly: true; productionEligible: false; prescriptionSelected: false;
  policyReference: string; ledger: WeeklyEvidenceLedger; candidates: WorkloadCandidate[]; findings: string[];
};

/** Analytical allocations only. Never returns assignments or substitutes a generator baseline. */
function compatibility(seconds: number, e: Beginner5kRunnerEvidence, ledger: WeeklyEvidenceLedger): SessionCompatibility {
  const result: SessionCompatibility = { status: 'unresolved', findings: [], modeledSessions: [], scheduleDates: [], conflicts: [], policyReference: proposal.foundationReference };
  const f = e.foundation.requestedFrequency; const capacity = e.foundation.currentContinuousRunningSeconds;
  if (!f || !foundation.supported_frequency.includes(f)) { result.findings.push('explicit_supported_frequency_required'); return result; }
  if (!Number.isSafeInteger(capacity) || capacity === null || capacity <= 0 || !e.foundation.currentEvidenceConfirmed) { result.findings.push('confirmed_continuous_capacity_required'); return result; }
  if (seconds < f) { result.findings.push('zero_or_insufficient_running_not_a_prescription'); return result; }
  if (e.foundation.healthConcern || e.foundation.healthRelatedInterruption) { result.findings.push('health_hold'); return result; }
  // The scheduler needs occupied time, not generated interval prescriptions.
  const steps = (total: number): PolicyWorkoutStep[] => [{ kind: 'work', instruction: 'Total occupied time for compatibility analysis only', purpose: 'Not a prescription', effort: null, repeats: 1, target: { kind: 'duration_seconds', value: total } }];
  if (e.constraints.availableDays.some(d => !Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6 || (d.maxMinutes !== null && (!Number.isFinite(d.maxMinutes) || d.maxMinutes <= 0)))) { result.status = 'conflict'; result.findings.push('invalid_calendar_constraints'); return result; }
  const maxLimit = Math.max(0, ...e.constraints.availableDays.map(d => d.maxMinutes ?? 0)) * 60;
  if (Math.ceil(seconds / f) + foundation.warmup_walk_seconds + foundation.cooldown_walk_seconds > maxLimit) { result.status = 'conflict'; result.findings.push('session_exceeds_time_limit'); return result; }
  for (let i=0; i<f; i++) {
    const running = Math.floor(seconds/f) + (i < seconds % f ? 1 : 0);
    const bouts = Math.ceil(running/capacity);
    const walking = foundation.warmup_walk_seconds + foundation.cooldown_walk_seconds + (bouts-1)*foundation.walking_recovery_seconds;
    if (!Number.isSafeInteger(running+walking)) { result.status='conflict'; result.findings.push('invalid_duration_arithmetic'); return result; }
    result.modeledSessions.push({ slot: String.fromCharCode(65+i), runningSeconds: running, walkingSeconds: walking, totalSeconds: running+walking, bouts });
  }
  const model: MultiDistanceTrainingPolicy = { id: foundation.policy_id, version: foundation.version, lifecycle: 'draft', releaseAuthorized: false, goalFamily: '5k', supportedFrequency: foundation.supported_frequency, minimumRecoveryDays: foundation.minimum_rest_days, sourceReferences: [proposal.foundationReference], requiredEvidence: ['current capability'], missingCapabilities: ['comparison_only'], weeks: [{ week: 1, phase: 'foundation', recoveryWeek: false, taper: false, workouts: result.modeledSessions.map(s => ({ slot: s.slot, role: 'comparison', phase: 'foundation', purpose: 'Compatibility analysis only', protected: true, target: { kind: 'duration_seconds', value: s.totalSeconds }, steps: steps(s.totalSeconds) })) }] };
  const priorDates = ledger.weeks.flatMap(w => w.exposures).map(s => s.localDate).filter((d): d is `${number}-${number}-${number}` => d !== null && isDateOnly(d) && d < e.constraints.startDate).sort();
  const lastDate = priorDates.at(-1);
  const boundaryDates = lastDate ? Array.from({ length: foundation.minimum_rest_days + 1 }, (_,i) => addCalendarDays(lastDate,i)) : [];
  const scheduled = schedulePolicyWeek(model, { ...e.constraints, unavailableDates: [...e.constraints.unavailableDates, ...boundaryDates] }, 1, { researchOnly: true });
  if (scheduled.kind === 'blocked') { result.status = 'conflict'; result.findings.push(...scheduled.reasonCodes); result.conflicts = scheduled.conflicts; return result; }
  result.scheduleDates = scheduled.workouts.map(w => w.date);
  if (e.constraints.fixedGoalDate && result.scheduleDates.some(d => d >= e.constraints.fixedGoalDate!)) { result.status = 'conflict'; result.findings.push('foundation_goal_date_conflict'); return result; }
  if (e.foundation.context === 'currently_training' && result.modeledSessions.some(s => s.bouts > 1)) { result.status = 'conflict'; result.findings.push('continuous_session_exceeds_capacity'); return result; }
  const exposures = ledger.weeks.flatMap(w => w.exposures).filter(s => s.runningExplicit && s.runningSeconds !== null && ['medium','high'].includes(s.reliability));
  if (!exposures.length) result.findings.push('accumulated_session_evidence_missing');
  else if (result.modeledSessions.some(s => s.runningSeconds > Math.max(...exposures.map(x => x.runningSeconds!)))) result.findings.push('accumulated_session_exceeds_observed_running');
  // An aggregate or one continuous bout does not establish repeatable run/walk capacity.
  if (result.modeledSessions.some(s => s.bouts > 1)) {
    const reported = exposures.filter(s => s.reportedBouts && s.reportedBouts.runningSeconds.length > 1 && s.reportedBouts.walkingRecoverySeconds.length === s.reportedBouts.runningSeconds.length-1 && [...s.reportedBouts.runningSeconds,...s.reportedBouts.walkingRecoverySeconds].every(n => Number.isSafeInteger(n) && n>0) && s.reportedBouts.runningSeconds.reduce((a,b)=>a+b,0) === s.runningSeconds);
    result.findings.push(reported.length ? 'repeatable_bout_evidence_present_compatibility_rule_unreviewed' : 'repeatable_bout_evidence_and_compatibility_rule_required');
  }
  result.findings.push('accumulated_session_compatibility_policy_unreviewed', 'adjacent_actual_session_recovery_requires_review');
  return result;
}

export function compareBeginner5kStartingWorkload(e: Beginner5kRunnerEvidence, reference = startingWorkloadProposalReference): StartingWorkloadComparison {
  const ledger = e.weeklyLedger ?? buildWeeklyEvidenceLedger({ ownerId: e.ownerId, targetWeek: e.constraints.startDate, evaluatedOn: e.evaluatedOn, timezone: e.timezone, episodeId: null, interruption: e.interruption, sessions: [], coverage: [] });
  const report = e.foundation.currentWeeklyRunningSeconds;
  const validReport = e.foundation.currentEvidenceConfirmed && isDateOnly(e.confirmedAt) && e.confirmedAt <= e.evaluatedOn && report !== null && Number.isSafeInteger(report) && report >= 0;
  const common: string[] = ledger.issues.filter(i => i === 'account_mismatch' || i === 'invalid_calendar_or_timezone');
  if (ledger.ownerId !== e.ownerId || e.constraints.ownerId !== e.ownerId) common.push('account_mismatch');
  if (ledger.targetWeek !== e.constraints.startDate || ledger.evaluatedOn !== e.evaluatedOn || ledger.timezone !== e.timezone) common.push('ledger_context_mismatch');
  if (reference !== startingWorkloadProposalReference) common.push('comparison_policy_version_unavailable');
  if (e.constraints.goalFamily !== '5k') common.push('beginner_5k_only');
  const observedReasons = [...common, ...ledger.issues];
  if (!ledger.episodeId || ledger.interruption) observedReasons.push('current_uninterrupted_episode_required');
  if (ledger.weeks.length !== proposal.observationWeeks || ledger.weeks.some(w => !['complete','confirmed_no_running'].includes(w.coverage) || w.runningTotalSeconds === null)) observedReasons.push('four_complete_consecutive_weeks_required');
  observedReasons.push(...ledger.weeks.flatMap(w => w.issues));
  if (!isDateOnly(ledger.targetWeek) || ledger.weeks.some((w,i) => w.start !== addCalendarDays(ledger.targetWeek as `${number}-${number}-${number}`, (i-proposal.observationWeeks)*7) || w.end !== addCalendarDays(w.start,6) || w.timezone !== e.timezone || w.end >= e.evaluatedOn || (w.runningTotalSeconds !== null && (!Number.isSafeInteger(w.runningTotalSeconds) || w.runningTotalSeconds < 0)))) observedReasons.push('noncomparable_week_windows');
  const values = ledger.weeks.map(w => w.runningTotalSeconds);
  if (!Number.isSafeInteger(values.reduce<number>((sum,v) => sum+(v ?? 0),0))) observedReasons.push('invalid_aggregate_duration');
  const candidates = (Object.keys(proposal.formulas) as Method[]).map(method => {
    const reasons = method === 'confirmed_report' ? [...common] : [...observedReasons];
    if (method !== 'observed_mean' && !validReport) reasons.push('confirmed_current_running_report_required');
    if (method === 'confirmed_report' && e.foundation.context === 'returning_after_break' && !e.foundation.demonstratedAfterBreak) reasons.push('post_break_current_evidence_required');
    const c: WorkloadCandidate = { method, available: false, runningSeconds: null, formula: proposal.formulas[method], formulaId: `formulas.${method}`, inputs: { reportSeconds: report, weeklySeconds: values }, unit: 'running_seconds', evidenceIds: method === 'confirmed_report' ? ['onboarding:weekly'] : ledger.weeks.flatMap(w => [...w.includedIds,...w.coverageIds]), exclusions: [...ledger.excluded, ...ledger.weeks.flatMap(w => w.excluded)], uncertainty: [...proposal.limitations], reasons: [...new Set(reasons)], policyReference: startingWorkloadProposalReference, researchOnly: true, productionEligible: false, compatibility: null };
    if (method === 'lower_reference') c.evidenceIds.push('onboarding:weekly');
    if (!c.reasons.length) {
      if (method === 'confirmed_report') c.runningSeconds = report;
      else {
        const numbers = values as number[]; const sum = numbers.reduce((a,b) => a+b,0); const sorted = [...numbers].sort((a,b) => a-b); const median = (sorted[1]! + sorted[2]!)/2;
        c.inputs.numerator = sum; c.inputs.denominator = proposal.observationWeeks; c.inputs.medianSeconds = median;
        c.runningSeconds = Math.floor(method === 'observed_mean' ? sum/proposal.observationWeeks : Math.min(report!, numbers.at(-1)!, median));
      }
      c.available = true; c.compatibility = compatibility(c.runningSeconds!, e, ledger);
    }
    return c;
  });
  const findings: string[] = [];
  if (validReport && candidates[1]!.available && report !== candidates[1]!.runningSeconds) findings.push('report_and_history_differ_not_automatically_contradictory');
  if (e.foundation.healthConcern || e.foundation.healthRelatedInterruption) findings.push('health_hold_no_prescription');
  return { researchOnly: true, productionEligible: false, prescriptionSelected: false, policyReference: startingWorkloadProposalReference, ledger, candidates, findings };
}
