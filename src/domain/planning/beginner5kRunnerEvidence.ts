import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import type { FoundationProgramEvidence } from './foundationProgram';
import type { MultiDistanceRunnerConstraints } from './multiDistancePolicy';
import { currentResearchOutcomes, type ResearchBlock, type ResearchOutcome } from './researchFoundation';
import { addCalendarDays, weekday } from '@/domain/calendar/operations';
import type { DateOnly } from '@/domain/calendar/dateOnly';
import workloadProposal from '../../../PolicyPack/foundation/04_starting_workload_comparison_v0.1.0_draft.json';

export type RunnerObservation = {
  source: 'onboarding' | 'manual_report' | 'gps_elapsed' | 'guided_execution'; sourceId: string;
  definition: 'weekly_running' | 'continuous_running' | 'historical_longest_session' | 'actual_running' | 'total_active' | 'phase_elapsed';
  value: number | null; unit: 'seconds'; date: string | null;
  confirmationDate?: string | null;
  window: { start: string | null; end: string | null; lookbackDays: number | null };
  timezone: string; currency: 'confirmed_current' | 'historical' | 'unconfirmed';
  reliability: 'high' | 'medium' | 'low' | 'unknown'; completeness: 'known' | 'unknown';
  included: boolean; reason: string;
};
export type Beginner5kRunnerEvidence = {
  ownerId: string; evaluatedOn: string; timezone: string; assessmentFingerprint: string;
  foundation: FoundationProgramEvidence; constraints: MultiDistanceRunnerConstraints;
  confirmedAt: string; interruption: boolean; observations: RunnerObservation[];
  lineage: { id: string; previousVersionId: string | null; assignmentId: string; current: boolean }[];
  issues: string[]; unreportedAssignmentIds: string[];
  weeklyLedger?: WeeklyEvidenceLedger;
};

/** Stable audit identity. The normalized assessment projection excludes draft bookkeeping. */
export function evidenceRevisionFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, canonical(item)])) : v;
  return JSON.stringify(canonical(value));
}

export type LedgerSession = {
  id: string; ownerId: string; activityId: string | null; source: 'research_outcome' | 'gps' | 'manual';
  localDate: string | null; instant?: string; timezone: string; episodeId: string | null;
  timezoneVerified?: boolean;
  runningSeconds: number | null; walkingSeconds: number | null; gpsElapsedSeconds: number | null;
  runningExplicit: boolean; status: string; reliability: RunnerObservation['reliability'];
  reportedBouts?: { sourceId: string; runningSeconds: readonly number[]; walkingRecoverySeconds: readonly number[] };
};
export type WeekCoverage = { ownerId: string; weekStart: string; timezone: string; episodeId: string | null; sourceId: string; coverage: 'complete' | 'confirmed_no_running' | 'partial' | 'unknown' };
export type WeeklyEvidenceWindow = {
  start: DateOnly; end: DateOnly; timezone: string;
  coverage: 'complete' | 'partial' | 'unknown' | 'confirmed_no_running';
  runningSubtotalSeconds: number | null; runningTotalSeconds: number | null;
  walkingSubtotalSeconds: number | null; gpsElapsedSubtotalSeconds: number | null;
  sessionCount: number; exposures: LedgerSession[]; includedIds: string[];
  excluded: { id: string; reason: string }[]; issues: string[]; coverageIds: string[];
};
export type WeeklyEvidenceLedger = {
  ownerId: string; targetWeek: string; evaluatedOn: string; timezone: string; episodeId: string | null;
  interruption: boolean; weeks: WeeklyEvidenceWindow[]; issues: string[];
  trainingContext?: { status: FoundationProgramEvidence['context']; lastRunningDate: string | null; interruptionReason: string };
  excluded: { id: string; reason: string }[];
  lineage: Beginner5kRunnerEvidence['lineage'];
};

/** Converts only instants; already-local outcome dates are never shifted through UTC. */
export function runnerLocalDate(instant: string, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)?.value).join('-');
  } catch { return null; }
}

/** Assigns evidence by its observation date; missing activity never creates an episode boundary. */
export function classifyLedgerSessionsByEpisode(sessions: readonly LedgerSession[], episode: { id: string; status: 'current'|'historical'|'unknown'; startedOn: string | null } | null, timezone: string): LedgerSession[] {
  if (!episode || episode.status!=='current' || !episode.startedOn || !isDateOnly(episode.startedOn)) return sessions.map(item=>({...item,episodeId:null}));
  return sessions.map(item=>{ const date=item.instant ? runnerLocalDate(item.instant,timezone) : item.localDate; return {...item,episodeId:date && isDateOnly(date) && date>=episode.startedOn! ? episode.id : `historical-before:${episode.id}`}; });
}

export function researchLedgerSessions(ownerId: string, timezone: string, history: readonly ResearchOutcome[]): { sessions: LedgerSession[]; lineage: Beginner5kRunnerEvidence['lineage']; issues: string[] } {
  let current: readonly ResearchOutcome[];
  try { current = currentResearchOutcomes(history); } catch { return { sessions: [], lineage: [], issues: ['conflicting_outcome_versions'] }; }
  const seen = new Map<string, ResearchOutcome>();
  for (const o of history) {
    const previous = o.previousVersionId ? seen.get(o.previousVersionId) : null;
    if (seen.has(o.id) || (o.previousVersionId && (!previous || previous.assignmentId !== o.assignmentId || previous.blockId !== o.blockId))) return { sessions: [], lineage: [], issues: ['invalid_outcome_lineage'] };
    seen.set(o.id, o);
  }
  return {
    issues: [], lineage: history.map(o => ({ id: o.id, previousVersionId: o.previousVersionId, assignmentId: o.assignmentId, current: current.some(c => c.id === o.id) })),
    sessions: current.map(o => ({ id: o.id, ownerId, activityId: o.associatedActivityId ?? o.record.activityLogId, source: 'research_outcome', localDate: o.record.actualDate, timezone, timezoneVerified: false, episodeId: null,
      runningSeconds: o.record.actualRunningSeconds, runningExplicit: (o.runningDurationSource === 'manual_report' || (o.runningDurationSource === undefined && o.record.source === 'manual')) && o.record.observedWindow.start === o.record.actualDate && o.record.observedWindow.end === o.record.actualDate,
      walkingSeconds: null, gpsElapsedSeconds: o.record.source === 'gps' ? o.record.actualDurationSeconds : null,
      status: o.record.status, reliability: o.record.durationReliability }))
  };
}

export function buildWeeklyEvidenceLedger(input: {
  ownerId: string; targetWeek: string; evaluatedOn: string; timezone: string; episodeId: string | null;
  interruption: boolean; sessions: readonly LedgerSession[]; coverage: readonly WeekCoverage[];
  lineage?: Beginner5kRunnerEvidence['lineage'];
  trainingContext?: WeeklyEvidenceLedger['trainingContext'];
}): WeeklyEvidenceLedger {
  const result: WeeklyEvidenceLedger = { ownerId: input.ownerId, targetWeek: input.targetWeek, evaluatedOn: input.evaluatedOn, timezone: input.timezone, episodeId: input.episodeId, interruption: input.interruption, trainingContext: input.trainingContext, weeks: [], issues: [], excluded: [], lineage: input.lineage ?? [] };
  if (!isDateOnly(input.targetWeek) || weekday(input.targetWeek) !== 0 || !isDateOnly(input.evaluatedOn) || !runnerLocalDate('2027-01-01T00:00:00Z', input.timezone)) { result.issues.push('invalid_calendar_or_timezone'); return result; }
  const groups = new Map<string, LedgerSession[]>();
  for (const s of input.sessions) {
    if (s.ownerId !== input.ownerId) { result.issues.push('account_mismatch'); continue; }
    const key = s.activityId ?? `source:${s.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const selected: LedgerSession[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a,b) => Number(b.source === 'research_outcome') - Number(a.source === 'research_outcome') || a.id.localeCompare(b.id));
    if (new Set(sorted.map(s => s.id)).size !== sorted.length || sorted.filter(s => s.source === 'research_outcome').length > 1) {
      result.issues.push('duplicate_activity_association'); result.excluded.push(...sorted.map(s => ({ id: s.id, reason: 'ambiguous_duplicate_activity' }))); continue;
    }
    const primary = sorted[0]!;
    const linkedDates = sorted.map(s => s.instant ? runnerLocalDate(s.instant, input.timezone) : s.localDate).filter(Boolean);
    if (new Set(linkedDates).size > 1) result.issues.push('linked_activity_date_disagreement');
    const elapsedValues = sorted.map(s => s.gpsElapsedSeconds).filter(v => v !== null);
    if (new Set(elapsedValues).size > 1) result.issues.push('linked_elapsed_disagreement');
    selected.push({ ...primary, gpsElapsedSeconds: primary.gpsElapsedSeconds ?? elapsedValues[0] ?? null });
    result.excluded.push(...sorted.slice(1).map(s => ({ id: s.id, reason: `linked_activity_counted_once:${sorted[0]!.id}` })));
  }
  for (let n = workloadProposal.observationWeeks; n >= 1; n--) {
    const start = addCalendarDays(input.targetWeek, -7*n); const end = addCalendarDays(start, 6);
    const w: WeeklyEvidenceWindow = { start, end, timezone: input.timezone, coverage: 'unknown', runningSubtotalSeconds: null, runningTotalSeconds: null, walkingSubtotalSeconds: null, gpsElapsedSubtotalSeconds: null, sessionCount: 0, exposures: [], includedIds: [], excluded: [], issues: [], coverageIds: [] };
    const declarations = input.coverage.filter(c => c.weekStart === start);
    if (declarations.some(c => c.ownerId !== input.ownerId)) w.issues.push('account_mismatch');
    const valid = declarations.filter(c => c.ownerId === input.ownerId && c.timezone === input.timezone && c.sourceId.trim().length > 0 && (c.coverage === 'unknown' || (c.episodeId !== null && c.episodeId === input.episodeId)));
    w.coverageIds = valid.map(c => c.sourceId).sort();
    if (new Set(valid.map(c => c.coverage)).size > 1) w.issues.push('conflicting_coverage');
    for (const s of selected) {
      const date = s.instant ? runnerLocalDate(s.instant, input.timezone) : s.localDate;
      if (!date || !isDateOnly(date) || (!s.instant && s.timezone !== input.timezone)) { result.excluded.push({ id: s.id, reason: 'observation_date_or_timezone_unknown' }); result.issues.push('observation_date_or_timezone_unknown'); continue; }
      if (date < start || date > end) continue;
      if (!s.instant && s.timezoneVerified === false) w.issues.push('historical_observation_timezone_unrecorded');
      if (s.episodeId !== null && s.episodeId !== input.episodeId) { w.excluded.push({ id: s.id, reason: 'historical_training_episode' }); w.issues.push('historical_training_episode'); continue; }
      if (s.status === 'unreported' || s.status === 'missed') { w.excluded.push({ id: s.id, reason: s.status }); if (s.status === 'unreported') w.issues.push('unreported_outcome'); continue; }
      w.exposures.push({ ...s, localDate: date }); w.includedIds.push(s.id);
    }
    w.sessionCount = w.exposures.length;
    const isSeconds = (v: number | null): v is number => v !== null && Number.isSafeInteger(v) && v >= 0;
    for (const s of w.exposures) {
      if ([s.runningSeconds,s.walkingSeconds,s.gpsElapsedSeconds].some(v => v !== null && !isSeconds(v))) w.issues.push('invalid_duration');
      if (s.runningSeconds !== null && s.gpsElapsedSeconds !== null && s.runningSeconds > s.gpsElapsedSeconds) w.issues.push('running_exceeds_elapsed');
    }
    const running = w.exposures.filter(s => s.runningExplicit && isSeconds(s.runningSeconds) && ['medium','high'].includes(s.reliability));
    for (const s of w.exposures) if (!running.includes(s)) w.excluded.push({ id: s.id, reason: 'running_duration_unknown_or_not_explicit' });
    w.runningSubtotalSeconds = running.length ? running.reduce((sum,s) => sum + s.runningSeconds!, 0) : null;
    const subtotal = (key: 'walkingSeconds' | 'gpsElapsedSeconds') => { const values = w.exposures.map(s => s[key]).filter(isSeconds); return values.length ? values.reduce((a,b) => a+b,0) : null; };
    w.walkingSubtotalSeconds = subtotal('walkingSeconds'); w.gpsElapsedSubtotalSeconds = subtotal('gpsElapsedSeconds');
    if (w.exposures.length) w.coverage = 'partial';
    if (valid.some(c => c.coverage === 'partial')) w.coverage = 'partial';
    if (valid.some(c => c.coverage === 'confirmed_no_running')) {
      if (w.exposures.some(s => !s.runningExplicit || s.runningSeconds !== 0)) w.issues.push('zero_week_conflicts_with_activity');
      else { w.coverage = 'confirmed_no_running'; w.runningTotalSeconds = 0; }
    } else if (valid.some(c => c.coverage === 'complete')) {
      if (!w.exposures.length || running.length !== w.exposures.length) w.issues.push('actual_running_or_zero_confirmation_required');
      else { w.coverage = 'complete'; w.runningTotalSeconds = w.runningSubtotalSeconds; }
    }
    if (end >= input.evaluatedOn) w.issues.push('observation_week_not_finished');
    if (w.issues.length) { w.runningTotalSeconds = null; w.coverage = w.exposures.length ? 'partial' : 'unknown'; }
    result.weeks.push(w);
  }
  result.issues = [...new Set(result.issues)];
  for (const s of selected) {
    const date = s.instant ? runnerLocalDate(s.instant, input.timezone) : s.localDate;
    if (date && (date < result.weeks[0]!.start || date > result.weeks.at(-1)!.end)) result.excluded.push({ id: s.id, reason: 'outside_candidate_observation_windows' });
  }
  result.excluded = [...new Map(result.excluded.map(e => [`${e.id}:${e.reason}`,e])).values()];
  return result;
}

export function normalizeBeginner5kEvidence(draft: FitnessAssessmentDraft, foundation: FoundationProgramEvidence, constraints: MultiDistanceRunnerConstraints, evaluatedOn: string, block: ResearchBlock | null, history: readonly ResearchOutcome[]): Beginner5kRunnerEvidence {
  const issues: string[] = [];
  if (draft.ownerId !== constraints.ownerId || (block && block.ownerId !== draft.ownerId)) issues.push('account_mismatch');
  if (!isDateOnly(evaluatedOn)) issues.push('invalid_evaluation_date');
  const confirmedAt = draft.foundationEvidenceConfirmedAt ?? '';
  const current = isDateOnly(confirmedAt) && confirmedAt <= evaluatedOn;
  if (!current) issues.push('current_confirmation_required');
  let outcomes: readonly ResearchOutcome[] = [];
  try { outcomes = currentResearchOutcomes(history); } catch { issues.push('conflicting_outcome_versions'); }
  const ids = new Set(outcomes.map(o => o.id));
  const observations: RunnerObservation[] = [];
  const add = (source: RunnerObservation['source'], sourceId: string, definition: RunnerObservation['definition'], value: number | null, date: string | null, included: boolean, reason: string, reliability: RunnerObservation['reliability'], currency: RunnerObservation['currency']) => observations.push({ source, sourceId, definition, value, date, unit: 'seconds', window: { start: null, end: date, lookbackDays: definition === 'weekly_running' && Number(draft.historyDays) > 0 ? Number(draft.historyDays) : null }, timezone: draft.timezone, currency, reliability, completeness: value === null ? 'unknown' : 'known', included, reason });
  add('onboarding', 'onboarding:weekly', 'weekly_running', foundation.currentWeeklyRunningSeconds, confirmedAt || null, current, current ? 'explicit_current_confirmation' : 'not_confirmed_current', 'medium', current ? 'confirmed_current' : 'unconfirmed');
  add('onboarding', 'onboarding:continuous', 'continuous_running', foundation.currentContinuousRunningSeconds, confirmedAt || null, current, current ? 'explicit_current_confirmation' : 'not_confirmed_current', 'medium', current ? 'confirmed_current' : 'unconfirmed');
  for (const observation of observations) { observation.confirmationDate = confirmedAt || null; observation.date = null; observation.window.end = null; }
  add('onboarding', 'onboarding:longest', 'historical_longest_session', draft.longestSessionMinutes.trim() ? Number(draft.longestSessionMinutes) * 60 : null, draft.longestSessionDate || null, false, 'historical_session_not_current_weekly_capacity', 'medium', 'historical');
  for (const o of outcomes) {
    add(o.record.source === 'gps' ? 'gps_elapsed' : 'manual_report', o.id, 'total_active', o.record.actualDurationSeconds, o.record.actualDate, false, 'total_time_is_not_running_time', o.record.durationReliability, 'historical');
    observations[observations.length - 1]!.window = { ...o.record.observedWindow, lookbackDays: null };
    const runningKnown = (o.runningDurationSource === 'manual_report' || o.record.source === 'manual') && o.record.actualRunningSeconds !== null;
    add('manual_report', o.id, 'actual_running', runningKnown ? o.record.actualRunningSeconds : null, o.record.actualDate, runningKnown, runningKnown ? 'reported_running_for_reassessment_only' : 'running_time_not_demonstrated', o.record.durationReliability, 'historical');
    observations[observations.length - 1]!.window = { ...o.record.observedWindow, lookbackDays: null };
    if (o.guidedExecution) add('guided_execution', o.id, 'phase_elapsed', null, o.record.actualDate, false, 'phase_elapsed_does_not_demonstrate_gait', 'unknown', 'historical');
    if (o.record.actualRunningSeconds !== null && o.record.actualDurationSeconds !== null && o.record.actualRunningSeconds > o.record.actualDurationSeconds) issues.push('running_duration_exceeds_total_duration');
  }
  return { ownerId: draft.ownerId, evaluatedOn, timezone: draft.timezone, assessmentFingerprint: assessmentEvidenceFingerprint(draft), foundation: { ...foundation, currentEvidenceConfirmed: foundation.currentEvidenceConfirmed && current }, constraints, confirmedAt, interruption: draft.interruption !== 'none', observations, issues, lineage: history.map(o => ({ id: o.id, previousVersionId: o.previousVersionId, assignmentId: o.assignmentId, current: ids.has(o.id) })), unreportedAssignmentIds: block ? block.assignments.filter(a => !outcomes.some(o => o.assignmentId === a.assignmentId)).map(a => a.assignmentId) : [] };
}
