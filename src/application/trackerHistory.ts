import { getTrackerOwnerId } from './trackerIdentity';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { activeSeconds, type RecordingSegment, type TrackingMetricVersion } from '@/domain/tracking/session';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { currentResearchOutcomes, type ResearchOutcome } from '@/domain/planning/researchFoundation';
import { loadKmSplits } from '@/data/trackingMetricsRepository';
import type { CompletedKmSplit } from '@/domain/tracking/liveRunMetrics';

type SavedTrackerRow = {
  id: string;
  mode: 'run' | 'walk';
  started_at_ms: number;
  ended_at_ms: number;
  checkpoint_at_ms: number;
  segments_json: string;
  distance_meters: number | null;
  status_reason: string | null;
  metric_version: TrackingMetricVersion;
};

export interface TrackerHistoryItem {
  id: string;
  mode: 'run' | 'walk';
  startedAtMs: number;
  endedAtMs: number;
  activeSeconds: number;
  elapsedSeconds: number;
  distanceMeters: number | null;
  gps: boolean;
  metricVersion: TrackingMetricVersion;
  completedKmSplits: readonly CompletedKmSplit[] | null;
  researchFeedback?: { plannedDate: string; status: string; difficulty: string | null; rpe: number | null; fatigue: string | null; discomfort: string | null; note: string | null };
}
export type PendingResearchCheckin = { activityId: string; blockId: string; assignmentId: string; plannedDate: string };

async function database() { const db = await openAppDatabase(); await migrate(db, new Date().toISOString()); return db; }

function mapRow(row: SavedTrackerRow): TrackerHistoryItem {
  const segments = JSON.parse(row.segments_json) as RecordingSegment[];
  return {
    id: row.id,
    mode: row.mode,
    startedAtMs: row.started_at_ms,
    endedAtMs: row.ended_at_ms,
    activeSeconds: activeSeconds(segments, row.ended_at_ms ?? row.checkpoint_at_ms),
    elapsedSeconds: Math.max(0, (row.ended_at_ms - row.started_at_ms) / 1000),
    distanceMeters: row.distance_meters,
    gps: row.status_reason !== 'timer_only',
    metricVersion: row.metric_version,
    completedKmSplits: null,
  };
}

export async function openTrackerHistory(): Promise<TrackerHistoryItem[]> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  const rows = await db.getAll<SavedTrackerRow>("SELECT id, mode, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, status_reason, metric_version FROM tracking_sessions WHERE owner_id = ? AND state = 'saved' ORDER BY started_at_ms DESC", [ownerId]);
  const items = await Promise.all(rows.map(async row => ({ ...mapRow(row), completedKmSplits: row.metric_version >= 2 ? await loadKmSplits(db, ownerId, row.id) : null })));
  if (!experimental5kPreviewEnabled) return items;
  try {
    const [outcomeRows, blockRows] = await Promise.all([
      db.getAll<{ activity_id: string | null; payload_json: string }>('SELECT activity_id, payload_json FROM research_foundation_outcomes WHERE owner_id = ?', [ownerId]),
      db.getAll<{ payload_json: string }>('SELECT payload_json FROM research_foundation_blocks WHERE owner_id = ?', [ownerId]),
    ]);
    const outcomes = currentResearchOutcomes(outcomeRows.map(row => JSON.parse(row.payload_json) as ResearchOutcome));
    const blocks = blockRows.map(row => JSON.parse(row.payload_json) as { id: string; assignments: { assignmentId: string; plannedDate: string }[] });
    return items.map(item => {
      const outcome = outcomes.find(value => value.associatedActivityId === `tracking:${item.id}`);
      if (!outcome) return item;
      const assignment = blocks.find(block => block.id === outcome.blockId)?.assignments.find(value => value.assignmentId === outcome.assignmentId);
      return assignment ? { ...item, researchFeedback: { plannedDate: assignment.plannedDate, status: outcome.record.status, difficulty: outcome.record.difficulty, rpe: outcome.record.rpe, fatigue: outcome.record.fatigue, discomfort: outcome.record.discomfort, note: outcome.record.note } } : item;
    });
  } catch {
    // Keep GPS history readable even if an experimental feedback record is malformed.
    return items;
  }
}

/** Pending feedback is recoverable only while its saved GPS activity and owned block still exist. */
export async function openPendingResearchCheckins(): Promise<PendingResearchCheckin[]> {
  if (!experimental5kPreviewEnabled) return [];
  const ownerId = await getTrackerOwnerId(); const db = await database();
  const pending = await db.getAll<{ activity_id: string; block_id: string; assignment_id: string }>('SELECT activity_id, block_id, assignment_id FROM research_pending_checkins WHERE owner_id = ?', [ownerId]);
  const result: PendingResearchCheckin[] = [];
  for (const item of pending) {
    const [activity, block, outcome] = await Promise.all([
      db.getFirst<{ id: string; state: string }>('SELECT id, state FROM tracking_sessions WHERE id = ? AND owner_id = ?', [item.activity_id, ownerId]),
      db.getFirst<{ payload_json: string }>('SELECT payload_json FROM research_foundation_blocks WHERE id = ? AND owner_id = ?', [item.block_id, ownerId]),
      db.getFirst<{ id: string }>('SELECT id FROM research_foundation_outcomes WHERE owner_id = ? AND activity_id = ?', [ownerId, `tracking:${item.activity_id}`]),
    ]);
    if (!activity || activity.state !== 'saved' || !block || outcome) continue;
    const payload = JSON.parse(block.payload_json) as { assignments?: { assignmentId: string; plannedDate: string }[] };
    const assignment = payload.assignments?.find(value => value.assignmentId === item.assignment_id);
    if (assignment) result.push({ activityId: `tracking:${item.activity_id}`, blockId: item.block_id, assignmentId: item.assignment_id, plannedDate: assignment.plannedDate });
  }
  return result;
}

export async function deleteTrackerHistoryItem(id: string): Promise<void> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  await db.transaction(async () => {
    const owned = await db.getFirst<{ id: string }>('SELECT id FROM tracking_sessions WHERE id = ? AND owner_id = ?', [id, ownerId]);
    if (!owned) return;
    await db.run('DELETE FROM research_pending_checkins WHERE activity_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_km_splits WHERE session_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_metric_edges WHERE session_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_gps_state WHERE session_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_gps_diagnostic_events WHERE session_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_gps_diagnostic_sessions WHERE session_id = ? AND owner_id = ?', [id, ownerId]);
    await db.run('DELETE FROM tracking_points WHERE session_id = ?', [id]);
    await db.run('DELETE FROM tracking_sessions WHERE id = ? AND owner_id = ?', [id, ownerId]);
  });
}

export async function exportGuestTrackerData(): Promise<string> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  const sessions = await db.getAll<Record<string, unknown>>('SELECT * FROM tracking_sessions WHERE owner_id = ? ORDER BY started_at_ms', [ownerId]);
  const ids = sessions.map((item) => String(item.id));
  const points = ids.length === 0 ? [] : (await Promise.all(ids.map((id) => db.getAll<Record<string, unknown>>('SELECT * FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms', [id])))).flat();
  const metricEdges = ids.length === 0 ? [] : (await Promise.all(ids.map(id => db.getAll<Record<string, unknown>>('SELECT * FROM tracking_metric_edges WHERE owner_id = ? AND session_id = ? ORDER BY observation_timestamp_ms', [ownerId, id])))).flat();
  const splits = ids.length === 0 ? [] : (await Promise.all(ids.map(id => db.getAll<Record<string, unknown>>('SELECT * FROM tracking_km_splits WHERE owner_id = ? AND session_id = ? ORDER BY kilometre', [ownerId, id])))).flat();
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), mode: 'local-guest-tracker', sessions, points, metricEdges, splits }, null, 2);
}

export async function deleteAllGuestTrackerData(): Promise<void> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  await db.transaction(async () => {
    await db.run('DELETE FROM tracking_active_gps_binding WHERE owner_id = ?', [ownerId]);
    await db.run('DELETE FROM research_pending_checkins WHERE owner_id = ?', [ownerId]);
    const sessions = await db.getAll<{ id: string }>('SELECT id FROM tracking_sessions WHERE owner_id = ?', [ownerId]);
    for (const session of sessions) { await db.run('DELETE FROM tracking_gps_diagnostic_events WHERE session_id = ? AND owner_id = ?', [session.id, ownerId]); await db.run('DELETE FROM tracking_gps_diagnostic_sessions WHERE session_id = ? AND owner_id = ?', [session.id, ownerId]); await db.run('DELETE FROM tracking_km_splits WHERE session_id = ? AND owner_id = ?', [session.id, ownerId]); await db.run('DELETE FROM tracking_metric_edges WHERE session_id = ? AND owner_id = ?', [session.id, ownerId]); await db.run('DELETE FROM tracking_gps_state WHERE session_id = ? AND owner_id = ?', [session.id, ownerId]); await db.run('DELETE FROM tracking_points WHERE session_id = ?', [session.id]); }
    await db.run('DELETE FROM tracking_sessions WHERE owner_id = ?', [ownerId]);
  });
}
