import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design/components';
import { colors, radius, spacing } from '@/design/tokens';
import type { MascotMouthState } from '@/domain/mascotLipSync';
import type { CoachDefinition } from './mascotAssets';

export function TalkingMascot({ coach, mouth, selected, onPress }: { coach: CoachDefinition; mouth: MascotMouthState; selected: boolean; onPress: () => void }) {
  const [scale] = useState(() => new Animated.Value(1)); const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  useEffect(() => { Animated.spring(scale, { friction: 7, tension: 90, toValue: selected && !reduceMotion ? 1.025 : 1, useNativeDriver: true }).start(); }, [reduceMotion, scale, selected]);
  const moss = coach.id === 'moss';
  return <Animated.View style={[styles.shell, { transform: [{ scale }] }]}><Pressable accessibilityLabel={`${coach.name}, ${coach.title}`} accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.card, selected && (moss ? styles.mossSelected : styles.jettSelected)]}>
    <View style={[styles.portrait, { aspectRatio: coach.frameAspectRatio }]}><Image resizeMode="contain" source={coach.frames[mouth]} style={styles.image} /></View>
    <AppText variant="section">{coach.name}</AppText><AppText variant="meta">{coach.title.toUpperCase()}</AppText>
  </Pressable></Animated.View>;
}

const styles = StyleSheet.create({ shell: { flex: 1, minWidth: 0 }, card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.large, borderWidth: 2, gap: spacing.xs, overflow: 'hidden', padding: spacing.sm }, mossSelected: { backgroundColor: colors.mossWash, borderColor: colors.moss }, jettSelected: { backgroundColor: colors.coralWash, borderColor: colors.coral }, portrait: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }, image: { height: '100%', width: '100%' } });
