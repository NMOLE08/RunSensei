import { requiredAccountRoute } from '@/features/auth/AuthBoundary';
import { preparePersistedAccountExit, resolveTransitionOwnerId } from '@/features/auth/AuthProvider';

describe('account-first route decisions', () => {
  it('does not permit a protected route without a valid session', () => {
    expect(requiredAccountRoute('signed_out', null)).toBe('/auth');
  });
  it('does not route through authenticated screens while account recovery is blocked', () => {
    expect(requiredAccountRoute('account_transition_blocked', null)).toBeNull();
  });
  it('keeps recovery tied to the persisted previous owner during a session mismatch', () => {
    expect(resolveTransitionOwnerId(null, null, 'account-a')).toBe('account-a');
    expect(resolveTransitionOwnerId('account-a', 'account-b', 'account-b')).toBe('account-a');
  });
  it('fails account-exit preparation closed against the persisted owner', async () => {
    const prepare = jest.fn(async () => { throw new Error('cutoff failed'); });
    const result = await preparePersistedAccountExit(null, null, async () => 'account-a', prepare, async () => null);
    expect(prepare).toHaveBeenCalledWith('account-a');
    expect(result).toMatchObject({ ownerId: 'account-a', error: expect.any(Error) });
  });
  it('fails closed when durable owner lookup fails before an owner can be resolved', async () => {
    const prepare = jest.fn();
    const result = await preparePersistedAccountExit(null, null, async () => { throw new Error('owner read failed'); }, prepare, async () => null);
    expect(result).toMatchObject({ ownerId: null, error: expect.any(Error) });
    expect(prepare).not.toHaveBeenCalled();
  });
  it('retries the durable pending binding owner after process-local state is lost', async () => {
    const prepare = jest.fn(async () => undefined);
    const result = await preparePersistedAccountExit(null, null, async () => 'account-current', prepare, async () => 'account-recording');
    expect(result).toEqual({ ownerId: 'account-recording', error: null });
    expect(prepare).toHaveBeenCalledWith('account-recording');
  });
  it('resumes an incomplete account at its saved onboarding step', () => {
    expect(requiredAccountRoute('ready', { status: 'in_progress', currentStep: 'goal', schemaVersion: 3, answers: {} })).toBe('/onboarding/goal');
    expect(requiredAccountRoute('ready', { status: 'in_progress', currentStep: 'coach', schemaVersion: 7, answers: { coachId: 'jett' } })).toBe('/onboarding/coach');
  });
  it('sends a completed account to home and defaults an invalid step safely', () => {
    expect(requiredAccountRoute('ready', { status: 'completed', currentStep: 'assessment', schemaVersion: 3, answers: {} })).toBe('/');
    expect(requiredAccountRoute('ready', { status: 'completed', currentStep: 'assessment', schemaVersion: 6, answers: {} })).toBe('/');
    expect(requiredAccountRoute('ready', { status: 'in_progress', currentStep: 'unexpected', schemaVersion: 3, answers: {} })).toBe('/onboarding/goal');
  });
});
