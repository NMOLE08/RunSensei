import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settingsSource = () => readFileSync(join(__dirname, '../../src/app/settings.tsx'), 'utf8');

describe('settings after removed diagnostics and export features', () => {
  it('no longer exposes the JSON export or workout checkpoint controls', () => {
    const source = settingsSource();
    for (const removed of [
      'Prepare JSON export',
      'exportLocalData',
      'Workout diagnostics',
      'checkpointLabels',
      'loadWorkoutCheckpoints',
      'subscribeWorkoutCheckpoints',
      'WorkoutCheckpoint',
      'showCheckpoints',
      'diagnosticsCard',
    ]) expect(source).not.toContain(removed);
  });

  it('keeps local account data deletion and GPS diagnostics available', () => {
    const source = settingsSource();
    expect(source).toContain('Delete local account data');
    expect(source).toContain('deleteLocalData(expoLocalNotifications)');
    expect(source).toContain('GPS diagnostics');
    expect(source).toContain('Export current GPS diagnostics');
    expect(source).toContain('internalGpsDiagnosticsEnabled');
  });

  it('describes local data removal without claiming all records stay on this phone', () => {
    const source = settingsSource();
    expect(source).toContain('Training records stored on this phone can be removed for this account.');
    expect(source).not.toContain('Nothing is uploaded');
  });
});
