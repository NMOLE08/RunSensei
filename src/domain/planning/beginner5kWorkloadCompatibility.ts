import { weekday } from '@/domain/calendar/operations';
import type { First5kDraftSession, First5kSimulation } from './first5kPolicyPack';
import type { Beginner5kPathway } from './beginner5kPersonalizationPolicy';

export type Beginner5kWorkloadEvidence = {
  continuousRunMinutes: number | null;
  weeklyRunningMinutes: number | null;
  weeklyDistance: number | null;
  longestRecentSessionMinutes: number | null;
  weekdayMinuteLimits: Readonly<Record<number, number | null>>;
};
export type Beginner5kWorkloadCompatibility = {
  kind: 'policy_gap' | 'scheduling_incompatible';
  reasonCodes: readonly string[];
  audit: {
    pathwayId: string;
    week1SessionDurationsSeconds: readonly number[];
    week1ExtendedSessionSeconds: number | null;
    week1MainSeconds: number | null;
    runnerEvidence: Beginner5kWorkloadEvidence;
  };
};

/**
 * Records factual workload comparisons but deliberately does not turn them
 * into a readiness judgement until a reviewed compatibility policy exists.
 */
export function assessBeginner5kWorkloadCompatibility(pathway: Beginner5kPathway, simulation: First5kSimulation, evidence: Beginner5kWorkloadEvidence): Beginner5kWorkloadCompatibility {
  const sessions = simulation.kind === 'draft_simulation' ? simulation.sessions.filter((session) => session.week === 1) : [];
  const week1Main = sessions.length === 3 ? sessions.reduce((sum, session) => sum + mainSeconds(session), 0) : null;
  const sessionC = sessions.find((session) => session.code === 'C');
  const audit = { pathwayId: pathway.id, week1SessionDurationsSeconds: sessions.map((session) => session.durationSeconds ?? 0), week1ExtendedSessionSeconds: sessionC ? mainSeconds(sessionC) : null, week1MainSeconds: week1Main, runnerEvidence: evidence };
  const reasonCodes = ['starting_workload_compatibility_rule_missing'];
  if (evidence.weeklyRunningMinutes === null && evidence.weeklyDistance === null) reasonCodes.push('missing_recent_weekly_training_evidence');
  if (evidence.longestRecentSessionMinutes === null) reasonCodes.push('missing_longest_recent_session_evidence');
  if (sessions.some((session) => evidence.weekdayMinuteLimits[weekday(session.date as `${number}-${number}-${number}`)] === null || evidence.weekdayMinuteLimits[weekday(session.date as `${number}-${number}-${number}`)] === undefined)) reasonCodes.push('missing_weekday_time_limit_evidence');
  if (pathway.id === 'continuous_running_beginner_fixed_12_week' && sessionC && evidence.continuousRunMinutes !== null && evidence.continuousRunMinutes * 60 < mainSeconds(sessionC)) reasonCodes.push('reported_continuous_capacity_below_week1_extended_session');
  const durationConflict = sessions.some((session) => {
    const limit = evidence.weekdayMinuteLimits[weekday(session.date as `${number}-${number}-${number}`)];
    return typeof limit === 'number' && (session.durationSeconds ?? 0) > limit * 60;
  });
  if (durationConflict) return { kind: 'scheduling_incompatible', reasonCodes: [...reasonCodes, 'weekday_time_limit_below_prescribed_session'], audit };
  return { kind: 'policy_gap', reasonCodes, audit };
}

function mainSeconds(session: First5kDraftSession) { return Math.max(0, (session.durationSeconds ?? 0) - 600); }
