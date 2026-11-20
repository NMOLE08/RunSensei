import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { AppText, Button, PageHeader, ProgressBar } from '@/design/components';
import { colors, motion, spacing } from '@/design/tokens';
import type { OnboardingQuestionScreen } from './questionFlow';

export function OnboardingQuestionScreenFrame({ screen, position, total, children, onBack, onContinue, continueLabel = 'Continue', continueDisabled = false, error }: { screen: OnboardingQuestionScreen; position: number; total: number; children: ReactNode; onBack?: () => void; onContinue?: () => void; continueLabel?: string; continueDisabled?: boolean; error?: string | null }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(8));
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      opacity.setValue(0); translateY.setValue(reduced ? 0 : 8);
      Animated.parallel([Animated.timing(opacity, { duration: reduced ? 0 : motion.quick, toValue: 1, useNativeDriver: true }), Animated.timing(translateY, { duration: reduced ? 0 : motion.quick, toValue: 0, useNativeDriver: true })]).start();
    });
    return () => { cancelled = true; };
  }, [opacity, screen.id, translateY]);
  return <>
    <PageHeader eyebrow={`YOUR STARTING POINT · ${position} OF ${total}`} title={screen.title} description={screen.description} />
    <ProgressBar label={`Onboarding question group ${position} of ${total}`} progress={position / total} />
    <Animated.View style={[styles.body, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>
    {(onBack || onContinue) && <View style={styles.navigation}>{onBack && <Button label="Back" onPress={onBack} tone="secondary" />}{onContinue && <Button disabled={continueDisabled} label={continueLabel} onPress={onContinue} />}{error && <AppText accessibilityLiveRegion="polite" style={styles.error}>{error}</AppText>}</View>}
  </>;
}

const styles = StyleSheet.create({ body: { gap: spacing.lg }, navigation: { gap: spacing.xs, paddingBottom: spacing.md }, error: { color: colors.error } });
