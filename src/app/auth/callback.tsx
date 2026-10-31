import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { saveLocalAccount } from '@/application/localAccount';
import { AppText, Button, Card, Screen } from '@/design/components';
import { completeAuthRedirect, supabase } from '@/services/auth/supabase';

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let navigating = false;
    const finish = async () => {
      if (navigating) return;
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session?.user || navigating) return;
      navigating = true;
      try {
        const user = data.session.user;
        await saveLocalAccount({ id: user.id, email: user.email ?? '', displayName: null, phone: null, dateOfBirth: null });
        if (active) router.replace('/onboarding/baseline');
      } catch {
        navigating = false;
        if (active) setError('Sign-in succeeded, but this device could not open its local account. Please try again.');
      }
    };
    const { data: subscription } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { void finish(); }, 0); });
    void Linking.getInitialURL().then(async (url) => { if (url) await completeAuthRedirect(url); await finish(); }).catch(() => { if (active) setError('Sign-in could not be completed. Please try again.'); });
    const timer = setTimeout(() => { if (active && !navigating) setError('Sign-in did not finish. Please try again.'); }, 15000);
    return () => { active = false; clearTimeout(timer); subscription.subscription.unsubscribe(); };
  }, []);

  return <Screen><Card><AppText variant="title">{error ? 'Sign-in needs attention' : 'Completing sign-in'}</AppText><AppText>{error ?? 'Please wait while we return you to the app.'}</AppText>{error && <Button label="Back to sign-in" onPress={() => router.replace('/auth')} />}</Card></Screen>;
}
