import { completeAuthRedirect, signInWithGoogle } from '@/services/auth/supabase';

const mockSetSession = jest.fn(async () => ({ error: null }));
const mockExchange = jest.fn(async () => ({ error: null }));
const mockSignIn = jest.fn(async () => ({ data: { url: 'https://auth.example.test' }, error: null }));
const mockBrowser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { setSession: (...args: unknown[]) => mockSetSession(...args as []), exchangeCodeForSession: (...args: unknown[]) => mockExchange(...args as []), signInWithOAuth: (...args: unknown[]) => mockSignIn(...args as []) } }) }));
jest.mock('expo-linking', () => ({ createURL: () => 'aisensei://auth/callback' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...args: unknown[]) => mockBrowser(...args) }));
jest.mock('@/data/supabaseStorage', () => ({ supabaseStorage: {} }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

it('completes an implicit Supabase redirect without requiring a code', async () => {
  mockBrowser.mockResolvedValueOnce({ type: 'success', url: 'aisensei://auth/callback#access_token=a&refresh_token=b' });
  await signInWithGoogle();
  expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'b' });
});
it('does not process the same callback twice when the browser and app both receive it', async () => {
  const url = 'aisensei://auth/callback?code=one-time-code';
  await Promise.all([completeAuthRedirect(url), completeAuthRedirect(url)]);
  expect(mockExchange).toHaveBeenCalledTimes(1);
});
it('treats browser cancellation as cancellation', async () => {
  mockBrowser.mockResolvedValueOnce({ type: 'cancel' });
  await expect(signInWithGoogle()).rejects.toThrow('cancelled');
});
