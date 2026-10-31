import { QWEN_MODEL } from '@/ai/modelManifest';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';

async function database() { const db = await openAppDatabase(); await migrate(db, new Date().toISOString()); return db; }

export async function saveModelInstallation(state: string, localPath: string | null, verifiedAt: string | null): Promise<void> {
  const db = await database(); const now = new Date().toISOString();
  await db.run('INSERT OR REPLACE INTO ai_model_installations (model_id,version,sha256,byte_size,local_path,state,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [QWEN_MODEL.id, QWEN_MODEL.version, QWEN_MODEL.sha256, QWEN_MODEL.byteSize, localPath, state, verifiedAt, now]);
}

export async function removeModelInstallation(): Promise<void> { const db = await database(); await db.run('DELETE FROM ai_model_installations WHERE model_id = ?', [QWEN_MODEL.id]); }
