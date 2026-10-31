import { QWEN_MODEL, requiredModelStorageBytes } from '@/ai/modelManifest';
import type { InferenceResult, LocalInferenceRuntime, ModelFileStore, ModelProgress, StructuredInferenceRequest } from './contracts';

export type LocalModelState =
  | { kind: 'checking' }
  | { kind: 'not_downloaded'; availableBytes: number }
  | { kind: 'downloading'; progress: ModelProgress }
  | { kind: 'verifying' }
  | { kind: 'available'; path: string }
  | { kind: 'loading'; progress: number }
  | { kind: 'ready'; path: string; description: string; systemInfo: string; gpu: boolean }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; code: string; message: string; recoverable: boolean };

type Listener = (state: LocalModelState) => void;

export class LocalModelManager {
  private state: LocalModelState = { kind: 'checking' };
  private listeners = new Set<Listener>();
  private operation: Promise<unknown> | null = null;

  constructor(private readonly store: ModelFileStore, private readonly runtime: LocalInferenceRuntime) {}

  getState(): LocalModelState { return this.state; }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  private publish(state: LocalModelState) { this.state = state; for (const listener of this.listeners) listener(state); }

  async inspect(): Promise<LocalModelState> {
    if (this.operation) return this.state;
    this.publish({ kind: 'checking' });
    try {
      const info = await this.store.inspect();
      if (!info.exists) {
        const availableBytes = await this.store.availableStorageBytes();
        this.publish({ kind: 'not_downloaded', availableBytes });
        return this.state;
      }
      if (info.byteSize !== QWEN_MODEL.byteSize || !info.path) {
        await this.store.remove();
        this.publish({ kind: 'error', code: 'model_size_mismatch', message: 'The downloaded model is incomplete and must be downloaded again.', recoverable: true });
        return this.state;
      }
      this.publish({ kind: 'verifying' });
      const digest = await this.store.digestSha256();
      if (digest.toLowerCase() !== QWEN_MODEL.sha256) {
        await this.store.remove();
        this.publish({ kind: 'error', code: 'model_hash_mismatch', message: 'The downloaded model failed its integrity check and was removed.', recoverable: true });
        return this.state;
      }
      this.publish({ kind: 'available', path: info.path });
      return this.state;
    } catch (error) {
      this.publish({ kind: 'error', code: 'model_inspection_failed', message: error instanceof Error ? error.message : 'The model could not be inspected.', recoverable: true });
      return this.state;
    }
  }

  async download(): Promise<LocalModelState> {
    if (this.operation) return this.state;
    const task = (async () => {
      try {
        const availableBytes = await this.store.availableStorageBytes();
        if (availableBytes < requiredModelStorageBytes()) {
          this.publish({ kind: 'error', code: 'insufficient_storage', message: 'At least 1.7 GB of free storage is required to download and verify the local model.', recoverable: true });
          return;
        }
        this.publish({ kind: 'downloading', progress: { completedBytes: 0, totalBytes: QWEN_MODEL.byteSize, fraction: 0 } });
        await this.store.download(QWEN_MODEL, (progress) => this.publish({ kind: 'downloading', progress }));
        this.publish({ kind: 'verifying' });
        const digest = await this.store.digestSha256();
        if (digest.toLowerCase() !== QWEN_MODEL.sha256) {
          await this.store.remove();
          this.publish({ kind: 'error', code: 'model_hash_mismatch', message: 'The model failed its integrity check and was removed.', recoverable: true });
          return;
        }
        const info = await this.store.inspect();
        if (!info.exists || !info.path || info.byteSize !== QWEN_MODEL.byteSize) throw new Error('The verified model file is unavailable.');
        this.publish({ kind: 'available', path: info.path });
      } catch (error) {
        const cancelled = error instanceof Error && /cancel/i.test(error.message);
        const availableBytes = await this.store.availableStorageBytes().catch(() => 0);
        this.publish(cancelled ? { kind: 'not_downloaded', availableBytes } : { kind: 'error', code: 'model_download_failed', message: error instanceof Error ? error.message : 'The model download failed.', recoverable: true });
      }
    })();
    this.operation = task;
    try { await task; } finally { this.operation = null; }
    return this.state;
  }

  async cancelDownload(): Promise<void> { await this.store.cancelDownload(); }

  async load(): Promise<LocalModelState> {
    if (this.operation) return this.state;
    let current = this.state;
    if (current.kind !== 'available' && current.kind !== 'ready') current = await this.inspect();
    if (current.kind === 'ready') return current;
    if (current.kind !== 'available') return current;
    const path = current.path;
    const task = (async () => {
      try {
        this.publish({ kind: 'loading', progress: 0 });
        const loaded = await this.runtime.load(path, (progress) => this.publish({ kind: 'loading', progress }));
        this.publish({ kind: 'ready', path, ...loaded });
      } catch (error) {
        this.publish({ kind: 'error', code: 'model_load_failed', message: error instanceof Error ? error.message : 'This device could not load the local model.', recoverable: true });
      }
    })();
    this.operation = task;
    try { await task; } finally { this.operation = null; }
    return this.state;
  }

  async generate(request: StructuredInferenceRequest, onToken?: (text: string) => void): Promise<InferenceResult> {
    if (this.operation) throw new Error('The local model is busy.');
    if (this.state.kind !== 'ready') throw new Error('Load the local model before using Run Sensei.');
    const task = this.runtime.generate(request, onToken);
    this.operation = task;
    try { return await task; } finally { this.operation = null; }
  }

  async cancelInference(): Promise<void> { await this.runtime.cancel(); }

  async remove(): Promise<void> {
    if (this.operation) throw new Error('Wait for the current model operation to finish or cancel it first.');
    await this.runtime.release();
    await this.store.remove();
    const availableBytes = await this.store.availableStorageBytes();
    this.publish({ kind: 'not_downloaded', availableBytes });
  }
}
