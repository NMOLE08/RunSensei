import { getTrackerOwnerId } from './trackerIdentity';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { activeSeconds, type RecordingSegment } from '@/domain/tracking/session';

type SavedTrackerRow = {
  id: string;
  mode: 'run' | 'walk';
  started_at_ms: number;
  ended_at_ms: number;
  checkpoint_at_ms: number;
  segments_json: string;
  distance_meters: number | null;
  status_reason: string | null;
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
}

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
  };
}

export async function openTrackerHistory(): Promise<TrackerHistoryItem[]> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  const rows = await db.getAll<SavedTrackerRow>("SELECT id, mode, started_at_ms, ended_at_ms, checkpoint_at_ms, segments_json, distance_meters, status_reason FROM tracking_sessions WHERE owner_id = ? AND state = 'saved' ORDER BY started_at_ms DESC", [ownerId]);
  return rows.map(mapRow);
}

export async function deleteTrackerHistoryItem(id: string): Promise<void> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  await db.transaction(async () => {
    const owned = await db.getFirst<{ id: string }>('SELECT id FROM tracking_sessions WHERE id = ? AND owner_id = ?', [id, ownerId]);
    if (!owned) return;
    await db.run('DELETE FROM tracking_points WHERE session_id = ?', [id]);
    await db.run('DELETE FROM tracking_sessions WHERE id = ? AND owner_id = ?', [id, ownerId]);
  });
}

export async function exportGuestTrackerData(): Promise<string> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  const sessions = await db.getAll<Record<string, unknown>>('SELECT * FROM tracking_sessions WHERE owner_id = ? ORDER BY started_at_ms', [ownerId]);
  const ids = sessions.map((item) => String(item.id));
  const points = ids.length === 0 ? [] : (await Promise.all(ids.map((id) => db.getAll<Record<string, unknown>>('SELECT * FROM tracking_points WHERE session_id = ? ORDER BY timestamp_ms', [id])))).flat();
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), mode: 'local-guest-tracker', sessions, points }, null, 2);
}

export async function deleteAllGuestTrackerData(): Promise<void> {
  const ownerId = await getTrackerOwnerId(); const db = await database();
  await db.transaction(async () => {
    const sessions = await db.getAll<{ id: string }>('SELECT id FROM tracking_sessions WHERE owner_id = ?', [ownerId]);
    for (const session of sessions) await db.run('DELETE FROM tracking_points WHERE session_id = ?', [session.id]);
    await db.run('DELETE FROM tracking_sessions WHERE owner_id = ?', [ownerId]);
  });
}
