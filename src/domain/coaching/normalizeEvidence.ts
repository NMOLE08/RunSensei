import { isDateOnly, type DateOnly } from '@/domain/calendar/dateOnly';
import { fingerprint } from '@/domain/context';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import type { DistanceEvidence, EvidenceFact, EvidenceIssue, FrequencyEvidence, NormalizedCoachingEvidence } from './evidence';

const date = (value: string | undefined): DateOnly | null => value && isDateOnly(value) ? value : null;
const issue = (code: string, fields: EvidenceIssue['fields']): EvidenceIssue => ({ code, fields });
const unavailable = <T>(state: 'missing' | 'unknown' | 'invalid' | 'conflicting' | 'unverifiable_freshness', fields: EvidenceIssue['fields'], code: string): EvidenceFact<T> => ({ state, fields, reasonCodes: [code], normalizationVersion: 1 });
const available = <T>(value: T, fields: EvidenceIssue['fields'], observedOn: DateOnly | null, confirmedOn: DateOnly | null): EvidenceFact<T> => ({ state: 'available', value, source: 'runner_reported', fields, observedOn, confirmedOn, reliability: 'runner_reported_unverified', normalizationVersion: 1 });
function measure(value: string, field: keyof FitnessAssessmentDraft, observedOn: DateOnly | null, confirmedOn: DateOnly | null): EvidenceFact<number> {
  if (value === '') return unavailable('missing', [field], 'measurement_missing');
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return unavailable('invalid', [field], 'measurement_invalid');
  return available(numeric, [field], observedOn, confirmedOn);
}
function distance(value: string, unit: unknown, field: 'weeklyDistance' | 'longestSessionDistance', unitField: 'weeklyDistanceUnit' | 'longestSessionDistanceUnit', observedOn: DateOnly | null, confirmedOn: DateOnly | null): EvidenceFact<DistanceEvidence> {
  if (value === '') return unavailable('missing', [field], 'distance_missing');
  if (unit !== 'km' && unit !== 'mi') return unavailable('invalid', [field, unitField], 'distance_unit_invalid');
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return unavailable('invalid', [field], 'distance_invalid');
  return available({ originalValue: numeric, unit, meters: numeric * (unit === 'mi' ? 1609.344 : 1000) }, [field, unitField], observedOn, confirmedOn);
}
function frequency(value: FitnessAssessmentDraft['observedWeeklyRunFrequency']): EvidenceFact<FrequencyEvidence> {
  if (value === 'unknown' || value === undefined) return unavailable('unknown', ['observedWeeklyRunFrequency'], 'observed_frequency_unknown');
  if (value === 'variable') return available({ kind: 'variable' }, ['observedWeeklyRunFrequency'], null, null);
  if (value === '5_plus') return available({ kind: 'five_or_more' }, ['observedWeeklyRunFrequency'], null, null);
  if (Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 4) return available({ kind: 'exact', days: value as 0 | 1 | 2 | 3 | 4 }, ['observedWeeklyRunFrequency'], null, null);
  return unavailable('invalid', ['observedWeeklyRunFrequency'], 'observed_frequency_invalid');
}
/** Pure snapshot: draft.updatedAt is deliberately absent from measurement provenance and identity. */
export function normalizeCoachingEvidence(draft: FitnessAssessmentDraft, evaluationDate: DateOnly): NormalizedCoachingEvidence {
  const weeklyConfirmedOn = date(draft.weeklyEvidenceConfirmedAt);
  const capacityConfirmedOn = date(draft.currentCapabilityConfirmedAt);
  const longestObservedOn = date(draft.longestSessionDate);
  const performanceDate = date(draft.performanceDate);
  const context: NormalizedCoachingEvidence['context'] = {
    runningStyle: draft.runningStyle ?? 'unknown', talkTest: draft.easyRunTalkTest ?? 'not_sure_or_not_applicable', usualEffort: draft.usualComfortableRunEffort ?? 'not_sure_or_not_applicable', consistency: draft.runningConsistency ?? 'unknown', status: draft.currentTrainingStatus, lastRunningDate: date(draft.lastRunningDate), interruption: draft.interruption, interruptionReason: draft.interruptionReason, healthConcern: draft.healthConcern, preferredFrequency: draft.preferredTrainingFrequency ?? 'unknown', availableDays: [...new Set(draft.trainingDays)].sort((a, b) => a - b), preferredLongDay: draft.preferredLongDay, unavailableDates: draft.unavailableDates.split(',').map(s => s.trim()).filter(isDateOnly).sort(), weeklyConfirmedOn, capacityConfirmedOn, foundationConfirmedOn: date(draft.foundationEvidenceConfirmedAt),
  };
  const issues: EvidenceIssue[] = [];
  if (context.consistency === 'currently_inactive' && context.status === 'currently_training') issues.push(issue('inactive_consistency_conflicts_with_current_training', ['runningConsistency', 'currentTrainingStatus']));
  if (draft.performanceDate && !performanceDate) issues.push(issue('performance_date_invalid', ['performanceDate']));
  if (draft.longestSessionDate && !longestObservedOn) issues.push(issue('longest_session_date_invalid', ['longestSessionDate']));
  const objective: NormalizedCoachingEvidence['objective'] = draft.schemaVersion < 8
    ? { value: draft.goalFocus === 'target_time' ? 'improve_performance' : draft.goalFocus === 'finish' ? 'finish' : 'unknown', origin: 'legacy_derived' }
    : { value: draft.trainingObjective ?? 'unknown', origin: draft.trainingObjective === 'unknown' ? 'unknown' : 'uncertain_explicit_or_default' };
  const facts = {
    weeklyMinutes: measure(draft.weeklyMinutes, 'weeklyMinutes', null, weeklyConfirmedOn), weeklyDistance: distance(draft.weeklyDistance, draft.weeklyDistanceUnit, 'weeklyDistance', 'weeklyDistanceUnit', null, weeklyConfirmedOn), historyDays: measure(draft.historyDays, 'historyDays', null, null), longestMinutes: measure(draft.longestSessionMinutes, 'longestSessionMinutes', longestObservedOn, capacityConfirmedOn), longestDistance: distance(draft.longestSessionDistance ?? '', draft.longestSessionDistanceUnit, 'longestSessionDistance', 'longestSessionDistanceUnit', longestObservedOn, capacityConfirmedOn), comfortableMinutes: measure(draft.comfortableRunMinutes, 'comfortableRunMinutes', null, capacityConfirmedOn), observedFrequency: frequency(draft.observedWeeklyRunFrequency),
    performance: { distanceMeters: measure(draft.performanceDistanceMeters, 'performanceDistanceMeters', performanceDate, null), seconds: measure(draft.performanceSeconds, 'performanceSeconds', performanceDate, null), date: performanceDate, kind: draft.performanceKind, effort: draft.performanceEffort, quality: draft.performanceQuality, suitability: draft.performanceKind === 'normal_run' && draft.performanceEffort === 'easy' ? 'non_maximal' as const : 'unassessed' as const },
  };
  const performance = { ...facts.performance, suitability: facts.performance.distanceMeters.state !== 'available' || facts.performance.seconds.state !== 'available' || !performanceDate ? 'incomplete' as const : facts.performance.suitability };
  const result = { version: 1 as const, ownerId: draft.ownerId, evaluationDate, ...facts, performance, objective, context, issues };
  return { ...result, identity: fingerprint({ version: 1, evaluationDate, ...facts, performance, objective, context, issues }) };
}
