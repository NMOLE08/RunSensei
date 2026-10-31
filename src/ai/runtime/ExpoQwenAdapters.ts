import { Directory, File, Paths, type DownloadTask } from 'expo-file-system';
import { Platform } from 'react-native';
import { initLlama, type LlamaContext } from 'llama.rn';
import type { InferenceResult, LocalInferenceRuntime, ModelFileStore, ModelManifest, ModelProgress, StructuredInferenceRequest } from './contracts';

const modelDirectory = new Directory(Paths.document, 'ai-models');
const modelFile = (name: string) => new File(modelDirectory, name);
const partialFile = (name: string) => new File(modelDirectory, `${name}.part`);

export class ExpoModelFileStore implements ModelFileStore {
  private activeDownload: DownloadTask | null = null;
  private ensureDirectory() { if (!modelDirectory.exists) modelDirectory.create({ intermediates: true, idempotent: true }); }
  async availableStorageBytes() { return Paths.availableDiskSpace; }
  async inspect() { this.ensureDirectory(); const file = modelFile('Qwen3.5-2B-Q4_K_M.gguf'); return { exists: file.exists, byteSize: file.exists ? file.size : 0, path: file.exists ? file.uri : null }; }
  async download(manifest: ModelManifest, onProgress: (progress: ModelProgress) => void): Promise<string> {
    this.ensureDirectory();
    const partial = partialFile(manifest.fileName); if (partial.exists) partial.delete();
    const final = modelFile(manifest.fileName); if (final.exists) final.delete();
    const task = File.createDownloadTask(manifest.downloadUrl, partial, { onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : manifest.byteSize;
      onProgress({ completedBytes: bytesWritten, totalBytes: total, fraction: Math.max(0, Math.min(1, bytesWritten / total)) });
    } });
    this.activeDownload = task;
    try {
      const result = await task.downloadAsync();
      if (!result) throw new Error('Model download was cancelled.');
      await partial.move(final, { overwrite: true });
      return final.uri;
    } finally { task.release(); this.activeDownload = null; }
  }
  async cancelDownload() { this.activeDownload?.cancel(); }
  async digestSha256() { const file = modelFile('Qwen3.5-2B-Q4_K_M.gguf'); if (!file.exists) throw new Error('Model file is missing.'); return file.digest('SHA-256'); }
  async remove() { this.ensureDirectory(); for (const file of [modelFile('Qwen3.5-2B-Q4_K_M.gguf'), partialFile('Qwen3.5-2B-Q4_K_M.gguf')]) if (file.exists) file.delete(); }
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
