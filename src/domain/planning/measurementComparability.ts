export type ObservationWindow = { start: string | null; end: string | null };
export type WeeklyVolumeObservation = { valueMinutes: number | null; window: ObservationWindow; unit: 'minutes' | 'unknown'; aggregation: 'weekly_total' | 'weekly_average' | 'rolling_total' | 'unknown'; includesLongestSession: boolean | null };
export type LongestSessionObservation = { valueMinutes: number | null; window: ObservationWindow; unit: 'minutes' | 'unknown'; aggregation: 'single_session' | 'unknown' };
export type AggregateLongestComparability = { kind: 'comparable'; reason: 'same_window_weekly_total_includes_longest_session' } | { kind: 'incomparable'; reason: 'observation_value_unknown' | 'observation_window_unknown' | 'incompatible_time_windows' | 'measurement_unit_unknown_or_mismatched' | 'weekly_measurement_is_not_total' | 'aggregate_membership_unknown_or_excluded' | 'longest_measurement_is_not_single_session' };

/** A weekly total may only be compared with a longest session when it contains that session over the exact same window. */
export function compareWeeklyTotalAndLongestSession(weekly: WeeklyVolumeObservation, longest: LongestSessionObservation): AggregateLongestComparability {
  if (weekly.valueMinutes === null || longest.valueMinutes === null) return { kind: 'incomparable', reason: 'observation_value_unknown' };
  if (!weekly.window.start || !weekly.window.end || !longest.window.start || !longest.window.end) return { kind: 'incomparable', reason: 'observation_window_unknown' };
  if (weekly.window.start !== longest.window.start || weekly.window.end !== longest.window.end) return { kind: 'incomparable', reason: 'incompatible_time_windows' };
  if (weekly.unit !== 'minutes' || longest.unit !== 'minutes') return { kind: 'incomparable', reason: 'measurement_unit_unknown_or_mismatched' };
  if (weekly.aggregation !== 'weekly_total') return { kind: 'incomparable', reason: 'weekly_measurement_is_not_total' };
  if (weekly.includesLongestSession !== true) return { kind: 'incomparable', reason: 'aggregate_membership_unknown_or_excluded' };
  if (longest.aggregation !== 'single_session') return { kind: 'incomparable', reason: 'longest_measurement_is_not_single_session' };
  return { kind: 'comparable', reason: 'same_window_weekly_total_includes_longest_session' };
}
