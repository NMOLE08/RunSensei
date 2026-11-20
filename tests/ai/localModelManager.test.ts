import { LocalModelManager } from '@/ai/runtime/LocalModelManager';
import { QWEN_MODEL, requiredModelStorageBytes } from '@/ai/modelManifest';
import type { LocalInferenceRuntime, ModelFileStore } from '@/ai/runtime/contracts';

function harness(overrides: Partial<{ available: number; exists: boolean; size: number; digest: string; partialBytes: number; failDownload: boolean; downloadDelayMs: number }> = {}) {
  let exists = overrides.exists ?? false; let removed = 0; let partialBytes = overrides.partialBytes ?? 0;
  const store: ModelFileStore = {
    availableStorageBytes: jest.fn(async () => overrides.available ?? requiredModelStorageBytes() + 1),
    inspect: jest.fn(async () => ({ exists, byteSize: overrides.size ?? QWEN_MODEL.byteSize, path: exists ? 'file:///model.gguf' : null })),
    inspectPartial: jest.fn(async () => ({ exists: partialBytes > 0, completedBytes: partialBytes, totalBytes: QWEN_MODEL.byteSize, resumable: partialBytes > 0 })),
    download: jest.fn(async (_manifest, progress) => { if (overrides.downloadDelayMs) await new Promise((resolve) => setTimeout(resolve, overrides.downloadDelayMs)); if (overrides.failDownload) { partialBytes = Math.max(partialBytes, 64 * 1024 * 1024); throw new Error('connection aborted'); } partialBytes = QWEN_MODEL.byteSize; progress({ completedBytes: partialBytes, totalBytes: QWEN_MODEL.byteSize, fraction: 1 }); return { kind: 'complete' as const, partialPath: 'file:///model.gguf.part' }; }),
    pauseDownload: jest.fn(async () => undefined), cancelDownload: jest.fn(async () => { partialBytes = 0; }), digestSha256: jest.fn(async () => overrides.digest ?? QWEN_MODEL.sha256),
    promoteVerified: jest.fn(async () => { exists = true; partialBytes = 0; return 'file:///model.gguf'; }),
    remove: jest.fn(async () => { exists = false; removed += 1; }),
  };
  const runtime: LocalInferenceRuntime = {
    load: jest.fn(async (_path, progress) => { progress(1); return { description: 'fixture', systemInfo: 'cpu', gpu: false }; }),
    generate: jest.fn(async () => ({ text: '{"status":"ready"}' })), cancel: jest.fn(async () => undefined), release: jest.fn(async () => undefined),
  };
  return { manager: new LocalModelManager(store, runtime), store, runtime, removed: () => removed };
}

describe('LocalModelManager', () => {
  test('reports an absent model without blocking the app', async () => { const { manager } = harness(); await manager.inspect(); expect(manager.getState().kind).toBe('not_downloaded'); });
  test('refuses download without storage headroom', async () => { const { manager, store } = harness({ available: requiredModelStorageBytes() - 1 }); await manager.download(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'insufficient_storage' }); expect(store.download).not.toHaveBeenCalled(); });
  test('downloads, verifies, loads CPU runtime, and generates', async () => { const { manager, runtime } = harness(); await manager.download(); expect(manager.getState().kind).toBe('available'); await manager.load(); expect(manager.getState()).toMatchObject({ kind: 'ready', gpu: false }); await expect(manager.generate({ systemPrompt: 's', userPrompt: 'u', schema: {}, maxTokens: 1 })).resolves.toMatchObject({ text: expect.stringContaining('ready') }); expect(runtime.generate).toHaveBeenCalledTimes(1); });
  test('removes a file with the wrong hash', async () => { const { manager, removed } = harness({ digest: 'wrong' }); await manager.download(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'model_hash_mismatch' }); expect(removed()).toBe(1); });
  test('removes incomplete existing file', async () => { const { manager, removed } = harness({ exists: true, size: 42 }); await manager.inspect(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'model_size_mismatch' }); expect(removed()).toBe(1); });
  test('restores a resumable partial download after restart', async () => { const { manager } = harness({ partialBytes: QWEN_MODEL.byteSize / 2 }); await manager.inspect(); expect(manager.getState()).toMatchObject({ kind: 'paused', progress: { fraction: 0.5 } }); await manager.download(); expect(manager.getState().kind).toBe('available'); });
  test('retains checkpointed bytes when a connection fails', async () => { const { manager } = harness({ failDownload: true }); await manager.download(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'model_download_failed', savedBytes: 64 * 1024 * 1024 }); });
  test('deduplicates concurrent provisioning requests', async () => { const { manager, store } = harness({ downloadDelayMs: 5 }); await Promise.all([manager.download(), manager.download()]); expect(store.download).toHaveBeenCalledTimes(1); });
});
