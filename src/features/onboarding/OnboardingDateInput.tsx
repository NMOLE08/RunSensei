import { useState } from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, View } from 'react-native';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { AppText } from '@/design/components';
import { colors, fontFamily, premiumRadius, spacing } from '@/design/tokens';
import { dateAfterPickerEvent, dateFromDateOnly } from './dateOnly';

export function OnboardingDateInput({ label, value, placeholder = 'Choose a date', onChange, accessibilityHint }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void; accessibilityHint?: string }) {
  const [open, setOpen] = useState(false);
  const select = (event: DateTimePickerEvent, selected?: Date) => {
    setOpen(false);
    const next = dateAfterPickerEvent(value, event.type, selected);
    if (next !== value) onChange(next);
  };
  return <View style={styles.wrap}>
    <AppText variant="meta" style={styles.label}>{label}</AppText>
    <Pressable accessibilityHint={accessibilityHint ?? 'Opens a calendar date picker.'} accessibilityLabel={`${label}. ${value || placeholder}`} accessibilityRole="button" onPress={() => setOpen(true)} style={styles.input}>
      <AppText style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</AppText>
      <AnimatedIcon name="calendar" size={22} />
    </Pressable>
    {open && <DateTimePicker display="default" mode="date" value={dateFromDateOnly(value)} onChange={select} />}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.mossDark },
  input: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.dividerStrong, borderRadius: premiumRadius.control, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  value: { color: colors.ink, fontFamily: fontFamily.body, fontSize: 16 },
  placeholder: { color: colors.subtleInk },
});
