import { LocalModelManager } from './LocalModelManager';
import { ExpoModelFileStore, QwenLlamaRuntime } from './ExpoQwenAdapters';

export const localModelManager = new LocalModelManager(new ExpoModelFileStore(), new QwenLlamaRuntime());
