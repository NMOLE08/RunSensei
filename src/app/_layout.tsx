import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { saveLocalAccount } from '@/application/localAccount';
import { trackerOnly } from '@/config/productMode';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  useEffect(() => {
    if (trackerOnly) return;
    const handle = (url: string) => { void import('@/services/auth/supabase').then(({ completeAuthRedirect }) => completeAuthRedirect(url)).catch(() => undefined); };
    void Linking.getInitialURL().then((url) => { if (url) handle(url); });
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (trackerOnly) return;
    let unsubscribe: (() => void) | undefined;
    void import('@/services/auth/supabase').then(async ({ supabase }) => {
      const { data } = await supabase.auth.getSession(); const user = data.session?.user; if (user) await saveLocalAccount({ id: user.id, email: user.email ?? '', displayName: typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : null, phone: typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : null, dateOfBirth: typeof user.user_metadata?.date_of_birth === 'string' ? user.user_metadata.date_of_birth : null });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { const changedUser = session?.user; if (changedUser) setTimeout(() => { void saveLocalAccount({ id: changedUser.id, email: changedUser.email ?? '', displayName: typeof changedUser.user_metadata?.display_name === 'string' ? changedUser.user_metadata.display_name : null, phone: typeof changedUser.user_metadata?.phone === 'string' ? changedUser.user_metadata.phone : null, dateOfBirth: typeof changedUser.user_metadata?.date_of_birth === 'string' ? changedUser.user_metadata.date_of_birth : null }).catch(() => undefined); }, 0); });
      unsubscribe = () => listener.subscription.unsubscribe();
    }).catch(() => undefined);
    return () => unsubscribe?.();
  }, []);
  const [fontsLoaded] = useFonts({
    Inter: require('../../assets/fonts/Inter-Variable.ttf'),
    IBMPlexMono: require('../../assets/fonts/IBMPlexMono-Regular.ttf'),
    PixelifySans: require('../../assets/fonts/PixelifySans-Variable.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout/[sessionId]" options={{ title: 'Workout detail' }} />
        <Stack.Screen name="training/[sessionId]" options={{ title: 'Start workout' }} />
        <Stack.Screen name="run" options={{ title: 'Outdoor run' }} />
        <Stack.Screen name="integrations/strava" options={{ title: 'Connected apps' }} />
        <Stack.Screen name="ai/model" options={{ title: 'Local AI model' }} />
        <Stack.Screen name="log/[sessionId]" options={{ title: 'Record activity' }} />
        <Stack.Screen name="onboarding/[step]" options={{ title: 'Onboarding' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="auth" options={{ title: 'Account' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="plan-review" options={{ title: 'Plan review' }} />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
