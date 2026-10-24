import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamily, radius, spacing } from '@/design/tokens';
import type { FixtureSession, FixtureState } from '@/design/fixtures';

type AppTextVariant = 'body' | 'title' | 'display' | 'meta' | 'label';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: AppTextVariant }) {
  return <Text {...props} style={[styles.text, textVariants[variant], style]} />;
}

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const content = scroll ? <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={styles.fill}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.fill}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, tone = 'primary', accessibilityHint }: { label: string; onPress?: () => void; tone?: 'primary' | 'secondary'; accessibilityHint?: string }) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, tone === 'secondary' && styles.buttonSecondary, pressed && styles.pressed]}
    >
      <AppText variant="label" style={tone === 'primary' ? styles.buttonPrimaryText : styles.buttonSecondaryText}>{label}</AppText>
    </Pressable>
  );
}

export function Field({ label, value, placeholder, onChangeText, accessibilityHint, ...inputProps }: { label: string; value?: string; placeholder?: string; onChangeText?: (value: string) => void; accessibilityHint?: string } & Omit<TextInputProps, 'accessibilityHint' | 'accessibilityLabel' | 'onChangeText' | 'placeholder' | 'placeholderTextColor' | 'style' | 'value'>) {
  return (
    <View style={styles.fieldWrap}>
      <AppText variant="meta">{label}</AppText>
      <TextInput
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        {...inputProps}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedInk}
        style={styles.field}
        value={value}
      />
    </View>
  );
}

export function StatusLabel({ state }: { state: FixtureState }) {
  const copy: Record<FixtureState, string> = { planned: 'PLANNED', rest: 'REST', empty: 'NO PLAN', completed: 'COMPLETED', error: 'NEEDS REVIEW' };
  return <AppText accessibilityLabel={`Fixture status: ${copy[state]}`} variant="meta" style={[styles.status, state === 'error' && styles.statusError, state === 'completed' && styles.statusComplete]}>{copy[state]}</AppText>;
}

const fixtureDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, index) => ({ day, date: String(12 + index) }));

export function DayStrip({ selectedDate = '13', days = fixtureDays }: { selectedDate?: string; days?: { day: string; date: string }[] }) {
  return (
    <View accessibilityLabel={`Week day strip. Selected day ${selectedDate}.`} accessibilityRole="summary" style={styles.dayStrip}>
      {days.map(({ day, date }) => {
        const selected = date === selectedDate;
        return <View accessibilityLabel={`${day} ${date}${selected ? ', selected' : ''}`} key={date} style={[styles.dayTile, selected && styles.dayTileSelected]}><AppText variant="meta" style={selected && styles.dayTileSelectedText}>{day}</AppText><AppText variant="body" style={[styles.dayDate, selected && styles.dayTileSelectedText]}>{date.slice(-2)}</AppText>{selected && <View accessibilityLabel="Selected date marker" style={styles.selectedMarker} />}</View>;
      })}
    </View>
  );
}

export function SessionRow({ session, onPress }: { session: FixtureSession; onPress?: () => void }) {
  return <Pressable accessibilityHint="Opens the fixture workout detail." accessibilityLabel={`${session.title}, ${session.target ?? session.purpose}, ${session.status}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}><View style={styles.sessionCopy}><AppText variant="meta">{session.dateLabel}</AppText><AppText variant="title" style={styles.sessionTitle}>{session.title}</AppText><AppText style={styles.sessionPurpose}>{session.target ?? session.purpose}</AppText></View><StatusLabel state={session.status} /></Pressable>;
}

export function TrainingReceipt({ session }: { session: FixtureSession }) {
  return <Card style={styles.receipt}>
    <View style={styles.receiptTop}><AppText variant="meta">ACTIVITY RECEIPT</AppText><StatusLabel state={session.status} /></View>
    <AppText variant="title">{session.title}</AppText>
    <View style={styles.rule} />
    <ReceiptLine label="PLANNED" value={session.target ?? 'Rest'} />
    <ReceiptLine label="ACTUAL" value={session.status === 'completed' ? 'Recorded in fixture' : 'Not recorded'} />
    <ReceiptLine label="SOURCE" value="Development fixture" />
  </Card>;
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.receiptLine}><AppText variant="meta">{label}</AppText><AppText style={styles.receiptValue}>{value}</AppText></View>;
}

export function ContourDecoration({ label = 'Decorative contour lines' }: { label?: string }) {
  return <View accessibilityElementsHidden accessibilityLabel={label} importantForAccessibility="no" pointerEvents="none" style={styles.contours}>{Array.from({ length: 5 }, (_, index) => <View key={index} style={[styles.contour, { inset: index * 8 }]} />)}</View>;
}

const textVariants = StyleSheet.create({
  body: { fontFamily: fontFamily.body, color: colors.ink, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: fontFamily.body, color: colors.ink, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  display: { fontFamily: fontFamily.display, color: colors.periwinkle, fontSize: 56, lineHeight: 62, letterSpacing: -1 },
  meta: { fontFamily: fontFamily.mono, color: colors.mutedInk, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  label: { fontFamily: fontFamily.body, color: colors.ink, fontSize: 16, fontWeight: '700', lineHeight: 20 },
});

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas }, fill: { flex: 1 }, scrollContent: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  text: { includeFontPadding: false }, card: { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.medium, borderWidth: StyleSheet.hairlineWidth, gap: spacing.sm, overflow: 'hidden', padding: spacing.md },
  button: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.ink, borderRadius: radius.small, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md }, buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 1 }, buttonPrimaryText: { color: colors.onInk }, buttonSecondaryText: { color: colors.ink }, pressed: { opacity: 0.76 },
  fieldWrap: { gap: spacing.xs }, field: { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.small, borderWidth: 1, color: colors.ink, fontFamily: fontFamily.body, fontSize: 16, minHeight: 48, paddingHorizontal: spacing.sm },
  status: { alignSelf: 'flex-start', backgroundColor: colors.accentWash, borderRadius: radius.small, color: colors.accentInk, overflow: 'hidden', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }, statusComplete: { backgroundColor: colors.ink, color: colors.onInk }, statusError: { backgroundColor: '#FCEDED', color: colors.error },
  dayStrip: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' }, dayTile: { alignItems: 'center', borderRadius: radius.small, flex: 1, gap: 2, minHeight: 56, justifyContent: 'center', paddingVertical: spacing.xs }, dayTileSelected: { backgroundColor: colors.ink }, dayDate: { fontFamily: fontFamily.body, fontSize: 16 }, dayTileSelectedText: { color: colors.onInk }, selectedMarker: { backgroundColor: colors.onInk, borderRadius: 2, height: 4, width: 4 },
  sessionRow: { alignItems: 'flex-start', backgroundColor: colors.surface, borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', minHeight: 80, paddingVertical: spacing.sm }, sessionCopy: { flex: 1, gap: 2 }, sessionTitle: { fontSize: 18, lineHeight: 24 }, sessionPurpose: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  receipt: { gap: spacing.sm }, receiptTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, rule: { backgroundColor: colors.divider, height: StyleSheet.hairlineWidth, width: '100%' }, receiptLine: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' }, receiptValue: { color: colors.ink, flexShrink: 1, fontSize: 14, textAlign: 'right' },
  contours: { bottom: -42, height: 180, opacity: 0.42, position: 'absolute', right: -40, width: 180 }, contour: { borderColor: colors.periwinkle, borderRadius: 999, borderWidth: 1, position: 'absolute' },
});
