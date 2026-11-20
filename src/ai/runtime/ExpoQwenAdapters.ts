import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { initLlama, type LlamaContext } from 'llama.rn';
import type { InferenceResult, LocalInferenceRuntime, ModelDownloadResult, ModelFileStore, ModelManifest, ModelProgress, StructuredInferenceRequest } from './contracts';

const modelDirectory = new Directory(Paths.document, 'ai-models');
const modelFile = (name: string) => new File(modelDirectory, name);
const partialFile = (name: string) => new File(modelDirectory, `${name}.part`);
const checkpointFile = (name: string) => new File(modelDirectory, `${name}.download.json`);
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 5;

type DownloadCheckpoint = { schemaVersion: 1; modelId: string; revision: string; url: string; byteSize: number; sha256: string; completedBytes: number; etag: string | null; updatedAt: string };
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const progressFor = (completedBytes: number, totalBytes: number): ModelProgress => ({ completedBytes, totalBytes, fraction: Math.max(0, Math.min(1, completedBytes / totalBytes)) });
const parseContentRange = (value: string | null): { start: number; end: number; total: number } | null => { const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i); return match ? { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) } : null; };
const checkpointMatches = (checkpoint: DownloadCheckpoint, manifest: ModelManifest, partialBytes: number) => checkpoint.schemaVersion === 1 && checkpoint.modelId === manifest.id && checkpoint.revision === manifest.version && checkpoint.url === manifest.downloadUrl && checkpoint.byteSize === manifest.byteSize && checkpoint.sha256 === manifest.sha256 && checkpoint.completedBytes === partialBytes && partialBytes <= manifest.byteSize;

export class ExpoModelFileStore implements ModelFileStore {
  private abortController: AbortController | null = null;
  private pauseRequested = false;
  private cancelRequested = false;
  private ensureDirectory() { if (!modelDirectory.exists) modelDirectory.create({ intermediates: true, idempotent: true }); }
  private async readCheckpoint(manifest: ModelManifest): Promise<DownloadCheckpoint | null> { const file = checkpointFile(manifest.fileName); if (!file.exists) return null; try { return JSON.parse(await file.text()) as DownloadCheckpoint; } catch { return null; } }
  private async writeCheckpoint(manifest: ModelManifest, completedBytes: number, etag: string | null) { const file = checkpointFile(manifest.fileName); await file.write(JSON.stringify({ schemaVersion: 1, modelId: manifest.id, revision: manifest.version, url: manifest.downloadUrl, byteSize: manifest.byteSize, sha256: manifest.sha256, completedBytes, etag, updatedAt: new Date().toISOString() } satisfies DownloadCheckpoint)); }
  private removePartial(manifest: ModelManifest) { for (const file of [partialFile(manifest.fileName), checkpointFile(manifest.fileName)]) if (file.exists) file.delete(); }
  async availableStorageBytes() { return Paths.availableDiskSpace; }
  async inspect() { this.ensureDirectory(); const file = modelFile('Qwen3.5-2B-Q4_K_M.gguf'); return { exists: file.exists, byteSize: file.exists ? file.size : 0, path: file.exists ? file.uri : null }; }
  async inspectPartial(manifest: ModelManifest) { this.ensureDirectory(); const partial = partialFile(manifest.fileName); const completedBytes = partial.exists ? partial.size : 0; const checkpoint = await this.readCheckpoint(manifest); return { exists: completedBytes > 0, completedBytes, totalBytes: manifest.byteSize, resumable: Boolean(checkpoint && checkpointMatches(checkpoint, manifest, completedBytes)) }; }
  async download(manifest: ModelManifest, onProgress: (progress: ModelProgress) => void): Promise<ModelDownloadResult> {
    this.ensureDirectory();
    this.pauseRequested = false; this.cancelRequested = false;
    const partial = partialFile(manifest.fileName); const existingCheckpoint = await this.readCheckpoint(manifest);
    let completedBytes = partial.exists ? partial.size : 0; let etag = existingCheckpoint?.etag ?? null;
    if (!existingCheckpoint || !checkpointMatches(existingCheckpoint, manifest, completedBytes)) { this.removePartial(manifest); completedBytes = 0; etag = null; }
    if (!partial.exists) partial.create({ intermediates: true, overwrite: false });
    onProgress(progressFor(completedBytes, manifest.byteSize));
    try {
      while (completedBytes < manifest.byteSize) {
        if (this.pauseRequested) return { kind: 'paused', progress: progressFor(completedBytes, manifest.byteSize) };
        if (this.cancelRequested) throw new Error('Model download was cancelled.');
        const end = Math.min(manifest.byteSize - 1, completedBytes + CHUNK_BYTES - 1); let chunk: Uint8Array<ArrayBuffer> | null = null; let responseEtag = etag; let lastError: unknown;
        for (let attempt = 0; attempt < MAX_CHUNK_ATTEMPTS && !chunk; attempt += 1) {
          if (attempt > 0) await delay(1000 * (2 ** (attempt - 1)));
          try {
            this.abortController = new AbortController(); const headers: Record<string, string> = { Range: `bytes=${completedBytes}-${end}`, 'Accept-Encoding': 'identity' }; if (etag) headers['If-Range'] = etag;
            const response = await fetch(manifest.downloadUrl, { headers, redirect: 'follow', signal: this.abortController.signal });
            if (this.pauseRequested) return { kind: 'paused', progress: progressFor(completedBytes, manifest.byteSize) };
            if (this.cancelRequested) throw new Error('Model download was cancelled.');
            const range = parseContentRange(response.headers.get('content-range'));
            if (response.status !== 206 || !range) throw new Error(`The model host did not honor byte-range download (${response.status}).`);
            if (range.start !== completedBytes || range.end !== end || range.total !== manifest.byteSize) throw new Error(`Unexpected model byte range ${response.headers.get('content-range') ?? 'missing'}.`);
            responseEtag = response.headers.get('etag') ?? etag; if (etag && responseEtag && etag !== responseEtag) throw new Error('The model host changed the file ETag during download.');
            const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength !== end - completedBytes + 1) throw new Error(`Incomplete model chunk: received ${bytes.byteLength} bytes.`); chunk = bytes;
          } catch (error) { lastError = error; if (this.pauseRequested) return { kind: 'paused', progress: progressFor(completedBytes, manifest.byteSize) }; if (this.cancelRequested) throw new Error('Model download was cancelled.'); } finally { this.abortController = null; }
        }
        if (!chunk) throw new Error(`Model download interrupted after ${MAX_CHUNK_ATTEMPTS} attempts. Saved progress: ${completedBytes} bytes. ${lastError instanceof Error ? lastError.message : ''}`.trim());
        const handle = partial.open(FileMode.Append); try { await handle.writeBytes(chunk); } finally { handle.close(); }
        completedBytes += chunk.byteLength; etag = responseEtag; await this.writeCheckpoint(manifest, completedBytes, etag); onProgress(progressFor(completedBytes, manifest.byteSize));
      }
      return { kind: 'complete', partialPath: partial.uri };
    } finally { this.abortController = null; if (this.cancelRequested) this.removePartial(manifest); }
  }
  async pauseDownload() { this.pauseRequested = true; this.abortController?.abort(); }
  async cancelDownload() { this.cancelRequested = true; this.abortController?.abort(); }
  async digestSha256(target: 'partial' | 'verified') { const file = target === 'partial' ? partialFile('Qwen3.5-2B-Q4_K_M.gguf') : modelFile('Qwen3.5-2B-Q4_K_M.gguf'); if (!file.exists) throw new Error('Model file is missing.'); return file.digest('SHA-256'); }
  async promoteVerified(manifest: ModelManifest) { const partial = partialFile(manifest.fileName); if (!partial.exists || partial.size !== manifest.byteSize) throw new Error('The complete temporary model is unavailable.'); const final = modelFile(manifest.fileName); if (final.exists) final.delete(); await partial.move(final, { overwrite: true }); const checkpoint = checkpointFile(manifest.fileName); if (checkpoint.exists) checkpoint.delete(); return final.uri; }
  async remove() { this.ensureDirectory(); for (const file of [modelFile('Qwen3.5-2B-Q4_K_M.gguf'), partialFile('Qwen3.5-2B-Q4_K_M.gguf'), checkpointFile('Qwen3.5-2B-Q4_K_M.gguf')]) if (file.exists) file.delete(); }
}

export class QwenLlamaRuntime implements LocalInferenceRuntime {
  private context: LlamaContext | null = null;
  async load(modelPath: string, onProgress: (fraction: number) => void) {
    if (Platform.OS !== 'android') throw new Error('This local-model build is currently verified only for 64-bit Android devices.');
    await this.release();
    const context = await initLlama({ model: modelPath, n_ctx: 4096, n_batch: 256, n_ubatch: 128, n_threads: 4, n_parallel: 1, n_gpu_layers: 0, flash_attn_type: 'off', use_mmap: true, no_extra_bufts: true }, (progress) => onProgress(progress / 100));
    this.context = context;
    return { description: context.model.desc, systemInfo: context.systemInfo, gpu: context.gpu };
  }
  async generate(request: StructuredInferenceRequest, onToken?: (text: string) => void): Promise<InferenceResult> {
    if (!this.context) throw new Error('The local model is not loaded.');
    const result = await this.context.completion({
      messages: [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: request.userPrompt }],
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: request.schema } },
      n_predict: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      top_k: 20,
      top_p: 0.9,
      enable_thinking: false,
    }, onToken ? (data) => { if (data.token) onToken(data.token); } : undefined);
    return { text: result.text, promptTokens: result.tokens_evaluated, generatedTokens: result.tokens_predicted, promptMs: result.timings?.prompt_ms, predictedMs: result.timings?.predicted_ms };
  }
  async cancel() { await this.context?.stopCompletion(); }
  async release() { if (this.context) { const current = this.context; this.context = null; await current.release(); } }
}
