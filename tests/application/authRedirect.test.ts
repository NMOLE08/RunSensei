import { parseAuthRedirect } from '@/services/auth/authRedirect';

const callback = 'aisensei://auth/callback';
it('accepts Supabase implicit and PKCE callbacks at the app callback', () => {
  expect(parseAuthRedirect(`${callback}#access_token=access&refresh_token=refresh`, callback)).toEqual({ kind: 'tokens', accessToken: 'access', refreshToken: 'refresh' });
  expect(parseAuthRedirect(`${callback}?code=abc%2B123`, callback)).toEqual({ kind: 'code', code: 'abc+123' });
  expect(parseAuthRedirect('aisensei:///auth/callback?code=abc', callback)).toEqual({ kind: 'code', code: 'abc' });
});
it('does not accept unrelated URLs, incomplete credentials, or provider errors as success', () => {
  expect(parseAuthRedirect('aisensei://other/callback#access_token=access&refresh_token=refresh', callback)).toEqual({ kind: 'unrelated' });
  expect(parseAuthRedirect('aisensei:///auth/callback/other?code=abc', callback)).toEqual({ kind: 'unrelated' });
  expect(parseAuthRedirect(`${callback}#access_token=access`, callback)).toEqual({ kind: 'incomplete' });
  expect(parseAuthRedirect(`${callback}?error=access_denied`, callback)).toEqual({ kind: 'error' });
});
