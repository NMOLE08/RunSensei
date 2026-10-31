export type AuthRedirect = { kind: 'code'; code: string } | { kind: 'tokens'; accessToken: string; refreshToken: string } | { kind: 'error' } | { kind: 'unrelated' } | { kind: 'incomplete' };

/** Only accept credentials returned to the exact app callback, never other deep links. */
export function parseAuthRedirect(url: string, expectedUrl: string): AuthRedirect {
  try {
    const actual = new URL(url); const expected = new URL(expectedUrl);
    const customScheme = expected.protocol !== 'https:' && expected.protocol !== 'http:';
    const path = (value: URL) => `${value.host}${value.pathname}`.replace(/^\/+|\/+$/g, '');
    if (actual.protocol !== expected.protocol || actual.username || actual.password || (customScheme ? path(actual) !== path(expected) : actual.host !== expected.host || actual.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, ''))) return { kind: 'unrelated' };
    const fragment = new URLSearchParams(actual.hash.replace(/^#/, ''));
    if (actual.searchParams.has('error') || fragment.has('error')) return { kind: 'error' };
    const code = actual.searchParams.get('code'); if (code) return { kind: 'code', code };
    const accessToken = fragment.get('access_token'); const refreshToken = fragment.get('refresh_token');
    if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
    return { kind: 'incomplete' };
  } catch { return { kind: 'unrelated' }; }
}
