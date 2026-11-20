import { File, Paths } from 'expo-file-system';

import { developerPlanExportFilename, serializeDeveloperPlanAttempt, type DeveloperPlanGenerationAttempt } from '@/domain/research/developerPlanGeneration';

export type DeveloperPlanExportResult =
  | { kind: 'share_sheet_opened'; uri: string; filename: string }
  | { kind: 'sharing_unavailable'; uri: string; filename: string }
  | { kind: 'failed'; message: string };

export type DeveloperPlanExportAdapter = {
  writeJson(filename: string, content: string): Promise<string>;
  sharingAvailable(): Promise<boolean>;
  openShareSheet(uri: string, label: 'A' | 'B' | 'C'): Promise<void>;
};

/** Writes the exact research attempt before requesting Android's native share sheet. */
export async function exportDeveloperPlanAttempt(attempt: DeveloperPlanGenerationAttempt, label: 'A' | 'B' | 'C'): Promise<DeveloperPlanExportResult> {
  return exportDeveloperPlanAttemptWithAdapter(attempt, label, nativeAdapter);
}

/** Dependency-injectable core for deterministic failure handling tests. */
export async function exportDeveloperPlanAttemptWithAdapter(attempt: DeveloperPlanGenerationAttempt, label: 'A' | 'B' | 'C', adapter: DeveloperPlanExportAdapter): Promise<DeveloperPlanExportResult> {
  const filename = developerPlanExportFilename(label, attempt.testId);
  try {
    const uri = await adapter.writeJson(filename, serializeDeveloperPlanAttempt(attempt));
    if (!await adapter.sharingAvailable()) return { kind: 'sharing_unavailable', uri, filename };
    await adapter.openShareSheet(uri, label);
    return { kind: 'share_sheet_opened', uri, filename };
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : 'The JSON export could not be written or shared.' };
  }
}

const nativeAdapter: DeveloperPlanExportAdapter = {
  async writeJson(filename, content) {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create({ intermediates: true });
    await file.write(content);
    return file.uri;
  },
  async sharingAvailable() {
    // Dynamic import prevents an older development client from crashing while
    // the new ExpoSharing native module is absent. Export still reports a
    // recoverable failure until the client has been rebuilt.
    const sharing = await import('expo-sharing');
    return sharing.isAvailableAsync();
  },
  async openShareSheet(uri, label) {
    const sharing = await import('expo-sharing');
    await sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: `Export research Plan ${label}` });
  },
};
