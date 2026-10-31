export const QWEN_MODEL = {
  id: 'qwen3.5-2b-q4_k_m',
  displayName: 'Qwen3.5 2B',
  version: 'f6d5376be1edb4d416d56da11e5397a961aca8ae',
  fileName: 'Qwen3.5-2B-Q4_K_M.gguf',
  quantization: 'Q4_K_M',
  byteSize: 1_280_835_840,
  sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
  downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae/Qwen3.5-2B-Q4_K_M.gguf',
  sourceUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF',
  license: 'Apache-2.0',
} as const;

export const MODEL_STORAGE_HEADROOM_BYTES = 512 * 1024 * 1024;
export const requiredModelStorageBytes = () => QWEN_MODEL.byteSize + MODEL_STORAGE_HEADROOM_BYTES;
