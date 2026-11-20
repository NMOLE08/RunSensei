import { type ReactNode, useEffect } from 'react';
import { router, useSegments } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, Card, Screen } from '@/design/components';
import { useAuth, type AuthStatus } from './AuthProvider';
import type { RemoteOnboardingProgress } from '@/services/account/onboardingProgress';

const onboardingSteps = new Set(['running', 'performance', 'goal', 'availability', 'assessment', 'coach']);

export function requiredAccountRoute(status: AuthStatus, onboarding: RemoteOnboardingProgress | null): string | null {
  if (status === 'signed_out') return '/auth';
  if (status !== 'ready') return null;
  if (onboarding?.status !== 'completed') return `/onboarding/${onboardingSteps.has(onboarding?.currentStep ?? '') ? onboarding?.currentStep : 'running'}`;
  return '/';
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth(); const segments = useSegments();
  const isAuth = segments[0] === 'auth'; const isOnboarding = segments[0] === 'onboarding';
  const required = requiredAccountRoute(auth.status, auth.onboarding);
  // Completed runners may re-open an onboarding section to edit saved facts.
  const editingCompletedOnboarding = auth.status === 'ready' && auth.onboarding?.status === 'completed' && isOnboarding;
  useEffect(() => { if (required && !editingCompletedOnboarding && !(required === '/auth' && isAuth) && !(required.startsWith('/onboarding/') && isOnboarding) && !(required === '/' && !isAuth && !isOnboarding)) router.replace(required as never); }, [required, isAuth, isOnboarding, editingCompletedOnboarding]);
  if (auth.status === 'initializing') return <Loading title="Checking your account" copy="Restoring your secure sign-in…" />;
  if (auth.status === 'account_transition_blocked') return <AccountTransitionRecovery />;
  if (auth.status === 'network_error') return <NetworkRecovery />;
  if (required && ((required === '/auth' && !isAuth) || (required.startsWith('/onboarding/') && !isOnboarding))) return <Loading title="Opening your account" copy="Please wait…" />;
  return <>{children}</>;
}

function Loading({ title, copy }: { title: string; copy: string }) { return <Screen><View><Card><AppText variant="title">{title}</AppText><AppText>{copy}</AppText></Card></View></Screen>; }
function NetworkRecovery() { const auth = useAuth(); const canContinue = auth.onboarding?.status === 'completed'; return <Screen><Card><AppText variant="title">Account needs a connection</AppText><AppText>{auth.error ?? 'We could not refresh your account.'}</AppText><Button label="Try again" onPress={() => { void auth.retry(); }} />{canContinue && <Button label="Continue offline" tone="secondary" onPress={auth.continueOffline} />}</Card></Screen>; }
function AccountTransitionRecovery() { const auth = useAuth(); return <Screen><Card><AppText variant="title">Workout needs recovery</AppText><AppText>{auth.error ?? 'Torto could not safely secure the active recording before the account changed.'}</AppText><AppText>Your recording remains attached to its original account. Retry to secure it before continuing.</AppText><Button label="Try recovery again" onPress={() => { void auth.retry(); }} /></Card></Screen>; }
