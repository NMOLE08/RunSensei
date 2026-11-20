import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { spacing } from '@/design/tokens';

/** Dedicated recording shell. It owns presentation only; tracker state remains in callers. */
export function LiveWorkoutScreen({ children, controls }: PropsWithChildren<{ controls: ReactNode }>) {
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}><StatusBar style="light" /><View style={styles.fill}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView><View style={styles.controls}>{controls}</View></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { backgroundColor: '#101512', flex: 1 }, fill: { flex: 1 }, content: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.md }, controls: { backgroundColor: '#101512', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm } });
