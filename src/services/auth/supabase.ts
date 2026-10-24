import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabaseStorage } from '@/data/supabaseStorage';

const url = 'https://simzbjtoyxvdswasccid.supabase.co';
const publishableKey = 'sb_publishable_XLAsF4_zpU413VzmfpnU9g_BtD7k9SL';
export const supabase = createClient(url, publishableKey, { auth: { storage: supabaseStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

export function authCallbackUrl(): string { return Linking.createURL('auth/callback'); }

export async function completeAuthRedirect(callbackUrl: string): Promise<void> {
  const parsed = Linking.parse(callbackUrl);
  const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : undefined;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const fragment = callbackUrl.split('#')[1];
  if (!fragment) return;
  const values = new URLSearchParams(fragment);
  const accessToken = values.get('access_token');
  const refreshToken = values.get('refresh_token');
  if (!accessToken || !refreshToken) return;
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> { const redirectTo = Linking.createURL('auth/callback'); const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Google sign-in could not be started.'); const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo); if (result.type !== 'success') return; const code = result.url.match(/[?&]code=([^&]+)/)?.[1]; if (!code) throw new Error('Google sign-in did not return an authorization code.'); const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code); if (exchangeError) throw exchangeError; }
