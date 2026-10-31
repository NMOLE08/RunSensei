import { LocalModelManager } from '@/ai/runtime/LocalModelManager';
import { QWEN_MODEL, requiredModelStorageBytes } from '@/ai/modelManifest';
import type { LocalInferenceRuntime, ModelFileStore } from '@/ai/runtime/contracts';

function harness(overrides: Partial<{ available: number; exists: boolean; size: number; digest: string }> = {}) {
  let exists = overrides.exists ?? false; let removed = 0;
  const store: ModelFileStore = {
    availableStorageBytes: jest.fn(async () => overrides.available ?? requiredModelStorageBytes() + 1),
    inspect: jest.fn(async () => ({ exists, byteSize: overrides.size ?? QWEN_MODEL.byteSize, path: exists ? 'file:///model.gguf' : null })),
    download: jest.fn(async (_manifest, progress) => { progress({ completedBytes: QWEN_MODEL.byteSize, totalBytes: QWEN_MODEL.byteSize, fraction: 1 }); exists = true; return 'file:///model.gguf'; }),
    cancelDownload: jest.fn(async () => undefined), digestSha256: jest.fn(async () => overrides.digest ?? QWEN_MODEL.sha256),
    remove: jest.fn(async () => { exists = false; removed += 1; }),
  };
  const runtime: LocalInferenceRuntime = {
    load: jest.fn(async (_path, progress) => { progress(1); return { description: 'fixture', systemInfo: 'cpu', gpu: false }; }),
    generate: jest.fn(async () => ({ text: '{"status":"ready"}' })), cancel: jest.fn(async () => undefined), release: jest.fn(async () => undefined),
  };
  return { manager: new LocalModelManager(store, runtime), store, runtime, removed: () => removed };
}

describe('LocalModelManager', () => {
  test('reports an optional absent model without blocking the app', async () => { const { manager } = harness(); await manager.inspect(); expect(manager.getState().kind).toBe('not_downloaded'); });
  test('refuses download without storage headroom', async () => { const { manager, store } = harness({ available: requiredModelStorageBytes() - 1 }); await manager.download(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'insufficient_storage' }); expect(store.download).not.toHaveBeenCalled(); });
  test('downloads, verifies, loads CPU runtime, and generates', async () => { const { manager, runtime } = harness(); await manager.download(); expect(manager.getState().kind).toBe('available'); await manager.load(); expect(manager.getState()).toMatchObject({ kind: 'ready', gpu: false }); await expect(manager.generate({ systemPrompt: 's', userPrompt: 'u', schema: {}, maxTokens: 1 })).resolves.toMatchObject({ text: expect.stringContaining('ready') }); expect(runtime.generate).toHaveBeenCalledTimes(1); });
  test('removes a file with the wrong hash', async () => { const { manager, removed } = harness({ digest: 'wrong' }); await manager.download(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'model_hash_mismatch' }); expect(removed()).toBe(1); });
  test('removes incomplete existing file', async () => { const { manager, removed } = harness({ exists: true, size: 42 }); await manager.inspect(); expect(manager.getState()).toMatchObject({ kind: 'error', code: 'model_size_mismatch' }); expect(removed()).toBe(1); });
});
