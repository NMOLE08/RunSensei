import { StyleSheet, View } from 'react-native';
import { AppText } from '@/design/components';
import { colors, radius, spacing } from '@/design/tokens';
import type { WorkoutAccent, WorkoutTimelineSection } from './workoutPresentation';

export function WorkoutStepTimeline({ sections, accent }: { sections: readonly WorkoutTimelineSection[]; accent: WorkoutAccent }) {
  return <View style={styles.container}>
    {sections.map((section, sectionIndex) => <View key={section.id} style={styles.section}>
      <View style={[styles.sectionHeader, accentHeader(accent)]}>
        <AppText variant="label" style={styles.sectionTitle}>{section.title}</AppText>
        {section.detail && <AppText variant="meta" style={styles.sectionDetail}>{section.detail}</AppText>}
      </View>
      <View style={styles.rows}>
        {section.rows.map((row, index) => <View key={row.id} style={styles.row}>
          <View style={styles.rail}>
            <AppText style={styles.stepNumber}>{sections.slice(0, sectionIndex).reduce((count, item) => count + item.rows.length, 0) + index + 1}</AppText>
            {index < section.rows.length - 1 && <View style={styles.connector} />}
          </View>
          <View style={styles.copy}>
            <View style={styles.primaryLine}>
              <AppText style={styles.primary}>{row.primary}</AppText>
              <View accessibilityLabel={`Step type: ${row.indicator}`} style={styles.indicator}><AppText variant="meta" style={styles.indicatorText}>{row.indicator}</AppText></View>
            </View>
            {row.secondary && <AppText style={styles.secondary}>{row.secondary}</AppText>}
          </View>
        </View>)}
      </View>
    </View>)}
  </View>;
}

function accentHeader(accent: WorkoutAccent) {
  return ({ moss: styles.headerMoss, coral: styles.headerCoral, butter: styles.headerButter, lavender: styles.headerLavender, event: styles.headerEvent })[accent];
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  section: { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.large, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  headerMoss: { backgroundColor: colors.mossWash },
  headerCoral: { backgroundColor: colors.coralWash },
  headerButter: { backgroundColor: colors.butterWash },
  headerLavender: { backgroundColor: '#EEE5F5' },
  headerEvent: { backgroundColor: colors.surfaceMuted },
  sectionTitle: { fontSize: 14, lineHeight: 20 },
  sectionDetail: { color: colors.mutedInk },
  rows: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, minHeight: 72 },
  rail: { alignItems: 'center', width: 34 },
  stepNumber: { color: colors.mutedInk, fontSize: 18, fontWeight: '600', lineHeight: 24, textAlign: 'center' },
  connector: { backgroundColor: colors.dividerStrong, flex: 1, marginBottom: 2, marginTop: spacing.xs, width: 2 },
  copy: { flex: 1, gap: spacing.xxs, paddingBottom: spacing.md },
  primaryLine: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  primary: { flex: 1, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  secondary: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 },
  indicator: { backgroundColor: colors.canvasRaised, borderRadius: radius.pill, flexShrink: 0, paddingHorizontal: spacing.xs, paddingVertical: 3 },
  indicatorText: { color: colors.mutedInk, fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
});
