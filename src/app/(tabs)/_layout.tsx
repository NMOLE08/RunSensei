import { Link, Tabs, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/design/components';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <View style={{ flexDirection: 'row', gap: 16 }}><Link href={'/profile' as Href} asChild><Pressable accessibilityLabel="Open profile" accessibilityRole="button" hitSlop={12}><AppText variant="title">◉</AppText></Pressable></Link><Link href="/settings" asChild><Pressable accessibilityLabel="Open settings" accessibilityRole="button" hitSlop={12}><AppText variant="title">⚙</AppText></Pressable></Link></View>, headerTitleAlign: 'left' }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: () => <AppText>◉</AppText> }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: () => <AppText>▤</AppText> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: () => <AppText>◷</AppText> }} />
    </Tabs>
  );
}
