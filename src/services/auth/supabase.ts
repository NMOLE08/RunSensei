import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabaseStorage } from '@/data/supabaseStorage';
import { parseAuthRedirect } from './authRedirect';

// Older Jest mocks do not implement this native browser cleanup helper.
WebBrowser.maybeCompleteAuthSession?.();

const url = 'https://simzbjtoyxvdswasccid.supabase.co';
const publishableKey = 'sb_publishable_XLAsF4_zpU413VzmfpnU9g_BtD7k9SL';
export const supabase = createClient(url, publishableKey, { auth: { storage: supabaseStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

export function authCallbackUrl(): string { return Linking.createURL('auth/callback'); }

let pendingCallback: { url: string; result: Promise<boolean> } | null = null;
export async function completeAuthRedirect(callbackUrl: string): Promise<boolean> {
  const parsed = parseAuthRedirect(callbackUrl, authCallbackUrl());
  if (parsed.kind === 'unrelated' || parsed.kind === 'incomplete') return false;
  if (parsed.kind === 'error') throw new Error('Sign-in could not be completed. Please try again.');
  if (pendingCallback?.url === callbackUrl) return pendingCallback.result;
  const result = (async () => {
    if (parsed.kind === 'code') { const { error } = await supabase.auth.exchangeCodeForSession(parsed.code); if (error) throw error; }
    else { const { error } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken }); if (error) throw error; }
    return true;
  })();
  pendingCallback = { url: callbackUrl, result };
  try { const completed = await result; setTimeout(() => { if (pendingCallback?.result === result) pendingCallback = null; }, 10000); return completed; } catch (error) { if (pendingCallback?.result === result) pendingCallback = null; throw error; }
}

export async function signInWithGoogle(): Promise<void> { const redirectTo = authCallbackUrl(); const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } }); if (error || !data.url) throw error ?? new Error('Google sign-in could not be started.'); const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo); if (result.type !== 'success') throw new Error('Google sign-in was cancelled.'); if (!await completeAuthRedirect(result.url)) throw new Error('Google did not return to the app correctly. Check the sign-in redirect settings.'); }
