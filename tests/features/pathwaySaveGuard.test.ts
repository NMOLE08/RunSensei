import { acquirePathwaySave, releasePathwaySave } from '@/features/execution/pathwaySaveGuard';

describe('pathway save press guard', () => {
  it('rejects a second press synchronously and permits a retry after release', () => {
    const guard = { current: false };
    expect(acquirePathwaySave(guard)).toBe(true);
    expect(acquirePathwaySave(guard)).toBe(false);
    releasePathwaySave(guard);
    expect(acquirePathwaySave(guard)).toBe(true);
  });
});
