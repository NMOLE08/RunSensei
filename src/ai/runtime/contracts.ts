import type { QWEN_MODEL } from '@/ai/modelManifest';

export type ModelManifest = typeof QWEN_MODEL;
export type ModelProgress = { completedBytes: number; totalBytes: number; fraction: number };
export type ModelFileInfo = { exists: boolean; byteSize: number; path: string | null };
export type PartialModelFileInfo = { exists: boolean; completedBytes: number; totalBytes: number; resumable: boolean };
export type ModelDownloadResult = { kind: 'complete'; partialPath: string } | { kind: 'paused'; progress: ModelProgress };

export interface ModelFileStore {
  availableStorageBytes(): Promise<number>;
  inspect(): Promise<ModelFileInfo>;
  inspectPartial(manifest: ModelManifest): Promise<PartialModelFileInfo>;
  download(manifest: ModelManifest, onProgress: (progress: ModelProgress) => void): Promise<ModelDownloadResult>;
  pauseDownload(): Promise<void>;
  cancelDownload(): Promise<void>;
  digestSha256(target: 'partial' | 'verified'): Promise<string>;
  promoteVerified(manifest: ModelManifest): Promise<string>;
  remove(): Promise<void>;
}

export type StructuredInferenceRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  maxTokens: number;
  temperature?: number;
};

export type InferenceResult = {
  text: string;
  promptTokens?: number;
  generatedTokens?: number;
  promptMs?: number;
  predictedMs?: number;
};

export interface LocalInferenceRuntime {
  load(modelPath: string, onProgress: (fraction: number) => void): Promise<{ description: string; systemInfo: string; gpu: boolean }>;
  generate(request: StructuredInferenceRequest, onToken?: (text: string) => void): Promise<InferenceResult>;
  cancel(): Promise<void>;
  release(): Promise<void>;
}
