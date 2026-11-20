import { localModelManager } from '@/ai/runtime/localModel';
import type { StructuredInferenceRequest } from '@/ai/runtime/contracts';
import { extractStructuredJsonText } from '@/ai/runtime/structuredJson';

export class QwenInferenceService {
  async structured(request: StructuredInferenceRequest): Promise<string> {
    return extractStructuredJsonText((await localModelManager.generate(request)).text);
  }
  async structuredWithMetrics(request: StructuredInferenceRequest) {
    const result = await localModelManager.generate(request);
    return { ...result, text: extractStructuredJsonText(result.text) };
  }
  async cancel(): Promise<void> { await localModelManager.cancelInference(); }
}

export const qwenInference = new QwenInferenceService();
