import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { clearActiveAccount, getPersistedActiveAccountId, purgeLegacyPlaintextSessionTokens, saveLocalAccount } from '@/application/localAccount';
import { bootstrapAccount, type RemoteOnboardingProgress } from '@/services/account/onboardingProgress';
import { cacheOnboardingState, readCachedOnboardingState } from '@/services/account/accountStateCache';
import { completeAuthRedirect, supabase } from '@/services/auth/supabase';
import { pendingTrackerAccountTransitionOwner, prepareTrackerForAccountExit } from '@/application/workoutTracker';

export type AuthStatus = 'initializing' | 'signed_out' | 'ready' | 'network_error' | 'account_transition_blocked';
type AuthContextValue = { status: AuthStatus; user: User | null; onboarding: RemoteOnboardingProgress | null; offline: boolean; error: string | null; retry: () => Promise<void>; continueOffline: () => void; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

const localAccount = (user: User) => ({ id: user.id, email: user.email ?? '', displayName: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null, phone: null, dateOfBirth: null });
export function resolveTransitionOwnerId(blockedOwnerId: string | null, visibleOwnerId: string | null, persistedOwnerId: string | null): string | null { return blockedOwnerId ?? visibleOwnerId ?? persistedOwnerId; }
export async function preparePersistedAccountExit(
  blockedOwnerId: string | null,
  visibleOwnerId: string | null,
  loadPersistedOwner: () => Promise<string | null> = getPersistedActiveAccountId,
  prepareExit: (ownerId: string) => Promise<void> = prepareTrackerForAccountExit,
  loadPendingOwner: () => Promise<string | null> = pendingTrackerAccountTransitionOwner,
): Promise<{ ownerId: string | null; error: unknown | null }> {
  let pendingOwnerId: string | null = null;
  let persistedOwnerId: string | null = null;
  try { pendingOwnerId = await loadPendingOwner(); persistedOwnerId = await loadPersistedOwner(); }
  catch (error) { return { ownerId: resolveTransitionOwnerId(pendingOwnerId ?? blockedOwnerId, visibleOwnerId, null), error }; }
  const ownerId = resolveTransitionOwnerId(pendingOwnerId ?? blockedOwnerId, visibleOwnerId, persistedOwnerId);
  if (!ownerId) return { ownerId: null, error: null };
  try { await prepareExit(ownerId); return { ownerId, error: null }; }
  catch (error) { return { ownerId, error }; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [user, setUser] = useState<User | null>(null);
  const [onboarding, setOnboarding] = useState<RemoteOnboardingProgress | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const userRef = useRef<User | null>(null);
  const transitionOwnerRef = useRef<string | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const blockAccountTransition = useCallback((ownerId: string, caught: unknown) => {
    transitionOwnerRef.current = ownerId;
    // Supabase may already have changed or expired the visible session. Do not
    // present the former user as authenticated while their recording remains
    // intentionally bound to that original owner in SQLite.
    userRef.current = null;
    setUser(null);
    setOnboarding(null);
    setOffline(false);
    setError(caught instanceof Error ? caught.message : 'The active workout could not be secured before changing accounts.');
    setStatus('account_transition_blocked');
  }, []);

  const restore = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus('initializing'); setError(null); setOffline(false);
    try {
      await purgeLegacyPlaintextSessionTokens();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const pendingOwnerId = await pendingTrackerAccountTransitionOwner();
      const previousOwnerId = resolveTransitionOwnerId(pendingOwnerId ?? transitionOwnerRef.current, userRef.current?.id ?? null, await getPersistedActiveAccountId());
      if (!data.session?.user) {
        if (previousOwnerId) {
          try { await prepareTrackerForAccountExit(previousOwnerId); }
          catch (caught) { blockAccountTransition(previousOwnerId, caught); return; }
        }
        transitionOwnerRef.current = null;
        await clearActiveAccount(); setUser(null); setOnboarding(null); setStatus('signed_out'); return;
      }
      const currentUser = data.session.user;
      // A blocked owner is a pending tracker-cleanup obligation even when the
      // refreshed Supabase identity is the same account.
      if (previousOwnerId && (previousOwnerId !== currentUser.id || transitionOwnerRef.current === previousOwnerId || pendingOwnerId === previousOwnerId)) {
        try { await prepareTrackerForAccountExit(previousOwnerId); }
        catch (caught) { blockAccountTransition(previousOwnerId, caught); return; }
      }
      transitionOwnerRef.current = null;
      await saveLocalAccount(localAccount(currentUser));
      setUser(currentUser);
      try {
        const remote = await bootstrapAccount(currentUser);
        await cacheOnboardingState(currentUser.id, remote);
        setOnboarding(remote); setStatus('ready');
      } catch (remoteError) {
        const cached = await readCachedOnboardingState(currentUser.id);
        setOnboarding(cached); setError(remoteError instanceof Error ? remoteError.message : 'Your account could not be refreshed.'); setStatus('network_error');
      }
    } catch (caught) {
      if (transitionOwnerRef.current) {
        blockAccountTransition(transitionOwnerRef.current, caught);
      } else {
        setUser(null); setOnboarding(null); setError(caught instanceof Error ? caught.message : 'Your session could not be restored.'); setStatus('signed_out');
      }
    } finally { running.current = false; }
  }, [blockAccountTransition]);

  useEffect(() => {
    const initialRestore = setTimeout(() => { void restore(); }, 0);
    const listener = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!session) { void (async () => {
        const prepared = await preparePersistedAccountExit(transitionOwnerRef.current, userRef.current?.id ?? null);
        const ownerId = prepared.ownerId;
        try {
          if (prepared.error) throw prepared.error;
          transitionOwnerRef.current = null;
          await clearActiveAccount(); setUser(null); setOnboarding(null); setOffline(false); setStatus('signed_out');
        } catch (caught) {
          if (ownerId) blockAccountTransition(ownerId, caught);
          else { setUser(null); setOnboarding(null); setError(caught instanceof Error ? caught.message : 'Recording ownership could not be verified.'); setStatus('account_transition_blocked'); }
        }
      })(); return; }
      setTimeout(() => { void restore(); }, 0);
    });
    const receive = ({ url }: { url: string }) => { void completeAuthRedirect(url).then((handled) => { if (handled) return restore(); }).catch((caught) => { setError(caught instanceof Error ? caught.message : 'Google sign-in could not be completed.'); setStatus('signed_out'); }); };
    void Linking.getInitialURL().then((url) => { if (url) receive({ url }); });
    const subscription = Linking.addEventListener('url', receive);
    return () => { clearTimeout(initialRestore); listener.data.subscription.unsubscribe(); subscription.remove(); };
  }, [restore, blockAccountTransition]);

  const continueOffline = useCallback(() => { if (onboarding?.status === 'completed') { setOffline(true); setStatus('ready'); } }, [onboarding]);
  const signOut = useCallback(async () => {
    const prepared = await preparePersistedAccountExit(transitionOwnerRef.current, userRef.current?.id ?? null);
    if (prepared.error) {
      if (prepared.ownerId) blockAccountTransition(prepared.ownerId, prepared.error);
      else { setError(prepared.error instanceof Error ? prepared.error.message : 'Recording ownership could not be verified.'); setStatus('account_transition_blocked'); }
      throw prepared.error;
    }
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
    transitionOwnerRef.current = null;
    await clearActiveAccount(); setUser(null); setOnboarding(null); setOffline(false); setStatus('signed_out');
  }, [blockAccountTransition]);
  const value = useMemo<AuthContextValue>(() => ({ status, user, onboarding, offline, error, retry: restore, continueOffline, signOut }), [status, user, onboarding, offline, error, restore, continueOffline, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
