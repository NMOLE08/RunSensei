import { Link, Tabs, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/design/components';
import { trackerOnly } from '@/config/productMode';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <View style={{ flexDirection: 'row', gap: 16 }}>{!trackerOnly && <Link href={'/profile' as Href} asChild><Pressable accessibilityLabel="Open profile" accessibilityRole="button" hitSlop={12}><AppText variant="title">◉</AppText></Pressable></Link>}<Link href="/settings" asChild><Pressable accessibilityLabel="Open settings" accessibilityRole="button" hitSlop={12}><AppText variant="title">⚙</AppText></Pressable></Link></View>, headerTitleAlign: 'left' }}>
      <Tabs.Screen name="index" options={{ title: trackerOnly ? 'Run' : 'Today', tabBarIcon: () => <AppText>◉</AppText> }} />
      <Tabs.Screen name="plan" options={{ href: trackerOnly ? null : undefined, title: 'Plan', tabBarIcon: () => <AppText>▤</AppText> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: () => <AppText>◷</AppText> }} />
    </Tabs>
  );
}
