import { Link, Tabs, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/design/components';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { trackerOnly } from '@/config/productMode';
import { colors, elevation, fontFamily } from '@/design/tokens';

export default function TabLayout() {
  const [iconTrigger, setIconTrigger] = useState<Record<'index' | 'plan' | 'history', number>>({ index: 0, plan: 0, history: 0 });
  const animateTab = (name: 'index' | 'plan' | 'history') => () => setIconTrigger((current) => ({ ...current, [name]: current[name] + 1 }));
  return (
    <Tabs screenOptions={{
      sceneStyle: { backgroundColor: colors.canvas },
      headerShadowVisible: false,
      headerStyle: { backgroundColor: colors.canvas },
      headerTitleStyle: { color: colors.ink, fontFamily: fontFamily.body, fontSize: 26, fontWeight: '800' },
      tabBarActiveTintColor: colors.coral,
      tabBarInactiveTintColor: colors.mutedInk,
      tabBarLabelStyle: { fontFamily: fontFamily.body, fontSize: 12, fontWeight: '700', marginTop: 1 },
      tabBarStyle: { ...elevation.floating, backgroundColor: colors.surface, borderTopColor: 'transparent', height: 76, paddingBottom: 8, paddingTop: 7 },
      headerRightContainerStyle: { paddingRight: 16 },
      headerRight: () => <View style={{ alignItems: 'center', flexDirection: 'row', gap: 14 }}><Link href={'/profile' as Href} asChild><Pressable accessibilityLabel="Open profile" accessibilityRole="button" hitSlop={12} style={{ alignItems: 'center', backgroundColor: colors.mossWash, borderRadius: 18, height: 38, justifyContent: 'center', width: 38 }}><AnimatedIcon name="profile" size={25} /></Pressable></Link><Link href="/settings" asChild><Pressable accessibilityLabel="Open settings" accessibilityRole="button" hitSlop={12} style={{ alignItems: 'center', backgroundColor: colors.butterWash, borderRadius: 18, height: 38, justifyContent: 'center', width: 38 }}><AppText style={{ fontSize: 21 }}>⚙</AppText></Pressable></Link></View>,
      headerTitleAlign: 'left',
    }}>
      <Tabs.Screen name="index" listeners={{ tabPress: animateTab('index') }} options={{ title: trackerOnly ? 'Run' : 'Today', tabBarIcon: ({ focused }) => <AnimatedIcon name="home" active={focused} trigger={iconTrigger.index} /> }} />
      <Tabs.Screen name="plan" listeners={{ tabPress: animateTab('plan') }} options={{ title: 'Plan', tabBarIcon: ({ focused }) => <AnimatedIcon name="calendar" active={focused} trigger={iconTrigger.plan} /> }} />
      <Tabs.Screen name="history" listeners={{ tabPress: animateTab('history') }} options={{ title: 'History', tabBarIcon: ({ focused }) => <AnimatedIcon name="clock" active={focused} trigger={iconTrigger.history} /> }} />
    </Tabs>
  );
}
