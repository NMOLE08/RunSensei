import { addWorkoutCheckpoint, clearWorkoutCheckpoints, loadWorkoutCheckpoints } from '@/application/workoutDiagnostics';

let mockValue: string | null = null;
const mockDatabase = {
  getFirst: jest.fn(async () => mockValue === null ? null : { value: mockValue }),
  run: jest.fn(async (sql: string, args: string[]) => { if (sql.startsWith('INSERT')) mockValue = args[1]; if (sql.startsWith('DELETE')) mockValue = null; return { changes: 1 }; }),
};
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: async () => mockDatabase }));
jest.mock('@/data/migrations', () => ({ migrate: async () => undefined }));

it('stores only timestamped tracker stage codes locally and removes them on deletion', async () => {
  addWorkoutCheckpoint('recording_started'); addWorkoutCheckpoint('gps_ready'); addWorkoutCheckpoint('distance_started');
  const saved = await loadWorkoutCheckpoints();
  expect(saved.map((entry) => entry.code)).toEqual(['recording_started', 'gps_ready', 'distance_started']);
  expect(JSON.parse(mockValue ?? '[]')).toEqual(saved);
  expect(Object.keys(saved[0]).sort()).toEqual(['code', 'time']);
  await clearWorkoutCheckpoints();
  expect(await loadWorkoutCheckpoints()).toEqual([]);
  expect(mockValue).toBeNull();
});
