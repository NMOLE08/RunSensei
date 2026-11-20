import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AuthBoundary } from '@/features/auth/AuthBoundary';
import { colors, fontFamily } from '@/design/tokens';
import '@/application/backgroundGpsTask';

export default function RootLayout() {
  useEffect(() => {
    void import('@/ai/runtime/localModel').then(async ({ localModelManager }) => {
      const state = await localModelManager.inspect();
      if (state.kind === 'available') await localModelManager.load();
    }).catch(() => undefined);
  }, []);
  const [fontsLoaded] = useFonts({
    Inter: require('../../assets/fonts/Inter-Variable.ttf'),
    IBMPlexMono: require('../../assets/fonts/IBMPlexMono-Regular.ttf'),
    PixelifySans: require('../../assets/fonts/PixelifySans-Variable.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider><AuthBoundary><Stack screenOptions={{ contentStyle: { backgroundColor: colors.canvas }, headerShadowVisible: false, headerStyle: { backgroundColor: colors.canvas }, headerTitleStyle: { color: colors.ink, fontFamily: fontFamily.body, fontWeight: '700' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout/[sessionId]" options={{ title: 'Workout detail' }} />
        <Stack.Screen name="training/[sessionId]" options={{ title: 'Start workout' }} />
        <Stack.Screen name="run" options={{ title: 'Outdoor run' }} />
        <Stack.Screen name="research-guided/[blockId]/[assignmentId]" options={{ title: 'Guided workout' }} />
        <Stack.Screen name="integrations/strava" options={{ title: 'Connected apps' }} />
        <Stack.Screen name="ai/model" options={{ title: 'Local AI model' }} />
        <Stack.Screen name="log/[sessionId]" options={{ title: 'Record activity' }} />
        <Stack.Screen name="onboarding/[step]" options={{ title: 'Onboarding' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="auth" options={{ title: 'Account' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="plan-review" options={{ title: 'Plan review' }} />
        <Stack.Screen name="developer/training-lab" options={{ title: 'Training Lab' }} />
        <Stack.Screen name="developer/plan-generation-lab" options={{ title: 'Plan Generation Lab' }} />
        <Stack.Screen name="developer/talking-jett-lab" options={{ title: 'Talking Jett Lab' }} />
      </Stack></AuthBoundary></AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
