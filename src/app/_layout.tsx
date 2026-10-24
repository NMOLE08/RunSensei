import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { completeAuthRedirect } from '@/services/auth/supabase';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  useEffect(() => {
    const handle = (url: string) => { void completeAuthRedirect(url).catch(() => undefined); };
    void Linking.getInitialURL().then((url) => { if (url) handle(url); });
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
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
        <Stack.Screen name="log/[sessionId]" options={{ title: 'Record activity' }} />
        <Stack.Screen name="onboarding/[step]" options={{ title: 'Onboarding' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="auth" options={{ title: 'Account' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
