import { localModelManager } from '@/ai/runtime/localModel';
import type { StructuredInferenceRequest } from '@/ai/runtime/contracts';

export class QwenInferenceService {
  async structured(request: StructuredInferenceRequest): Promise<string> { return (await localModelManager.generate(request)).text; }
  async cancel(): Promise<void> { await localModelManager.cancelInference(); }
}

export const qwenInference = new QwenInferenceService();
