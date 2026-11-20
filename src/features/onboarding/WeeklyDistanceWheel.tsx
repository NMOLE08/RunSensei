import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design/components';
import { colors, premiumRadius, radius, spacing } from '@/design/tokens';
import { formatWheelDistanceKm, WEEKLY_DISTANCE_WHEEL_VALUES_KM, wheelIndexForWeeklyDistance } from './distanceWheel';

const ROW_HEIGHT = 44;
const SIDE_ROWS = 2;
const FALLBACK_INDEX = 20; // Presentation only. It never writes 10 km into the form.

/** Android receives this nested list's vertical gesture before the page ScrollView. */
export function WeeklyDistanceWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const list = useRef<FlatList<number>>(null);
  const selectedIndex = wheelIndexForWeeklyDistance(value);
  const [visibleIndex, setVisibleIndex] = useState(selectedIndex ?? FALLBACK_INDEX);
  const initialIndex = selectedIndex ?? FALLBACK_INDEX;
  useEffect(() => {
    if (selectedIndex === null) return;
    // Let the native list mount/settle before synchronizing an externally edited value.
    const frame = requestAnimationFrame(() => {
      setVisibleIndex(selectedIndex);
      list.current?.scrollToIndex({ animated: false, index: selectedIndex });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  const layout = useMemo(() => (_: ArrayLike<number> | null | undefined, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }), []);
  const indexAtOffset = (offset: number) => Math.max(0, Math.min(WEEKLY_DISTANCE_WHEEL_VALUES_KM.length - 1, Math.round(offset / ROW_HEIGHT)));
  const updateVisible = (offset: number) => setVisibleIndex(indexAtOffset(offset));
  const commitOffset = (offset: number) => {
    const index = indexAtOffset(offset);
    setVisibleIndex(index);
    onChange(formatWheelDistanceKm(WEEKLY_DISTANCE_WHEEL_VALUES_KM[index]!));
  };
  const choose = (index: number) => {
    list.current?.scrollToIndex({ animated: true, index });
    setVisibleIndex(index);
    onChange(formatWheelDistanceKm(WEEKLY_DISTANCE_WHEEL_VALUES_KM[index]!));
  };
  return <View accessibilityLabel="Weekly distance wheel, kilometres" style={styles.shell}>
    <View style={styles.header}><AppText variant="meta">DISTANCE WHEEL</AppText><View style={styles.unitPill}><AppText variant="meta" style={styles.unitPillText}>KM</AppText></View></View>
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.topFade} />
      <View pointerEvents="none" style={styles.selectionBand}><View style={styles.selectionDot} /><View style={styles.selectionDot} /></View>
      <View pointerEvents="none" style={styles.bottomFade} />
      <FlatList
        bounces={false}
        contentContainerStyle={styles.content}
        data={WEEKLY_DISTANCE_WHEEL_VALUES_KM}
        decelerationRate="fast"
        disableIntervalMomentum
        getItemLayout={layout}
        initialScrollIndex={initialIndex}
        keyExtractor={(item) => String(item)}
        nestedScrollEnabled
        onMomentumScrollEnd={(event) => commitOffset(event.nativeEvent.contentOffset.y)}
        onScroll={(event) => updateVisible(event.nativeEvent.contentOffset.y)}
        renderItem={({ item, index }) => {
          const active = index === visibleIndex;
          const distanceFromCenter = Math.abs(index - visibleIndex);
          return <Pressable accessibilityLabel={`${formatWheelDistanceKm(item)} kilometres`} accessibilityRole="button" onPress={() => choose(index)} style={styles.row}>
            <AppText style={[styles.value, distanceFromCenter === 1 && styles.nearValue, active && styles.activeValue]}>{formatWheelDistanceKm(item)} <AppText style={[styles.unit, active && styles.activeUnit]}>km</AppText></AppText>
          </Pressable>;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={ROW_HEIGHT}
        style={styles.list}
      />
    </View>
    <AppText accessibilityLiveRegion="polite" style={styles.caption}>{selectedIndex === null ? 'Scroll to choose a kilometre value. Your manual entry remains unchanged until you select one.' : `${formatWheelDistanceKm(WEEKLY_DISTANCE_WHEEL_VALUES_KM[selectedIndex]!)} km selected`}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.canvasRaised, borderColor: colors.divider, borderRadius: premiumRadius.control, borderWidth: 1, gap: spacing.xs, overflow: 'hidden', padding: spacing.sm },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  unitPill: { backgroundColor: colors.mossWash, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  unitPillText: { color: colors.mossDark, fontWeight: '800' },
  wheel: { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.medium, borderWidth: 1, height: ROW_HEIGHT * (SIDE_ROWS * 2 + 1), overflow: 'hidden', position: 'relative' },
  selectionBand: { alignItems: 'center', backgroundColor: colors.butterWash, borderColor: colors.butter, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: ROW_HEIGHT, justifyContent: 'space-between', left: 0, paddingHorizontal: spacing.sm, position: 'absolute', right: 0, top: ROW_HEIGHT * SIDE_ROWS, zIndex: 1 },
  selectionDot: { backgroundColor: colors.coral, borderRadius: radius.pill, height: 5, width: 5 },
  topFade: { backgroundColor: 'rgba(242,235,221,0.66)', height: ROW_HEIGHT * SIDE_ROWS, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  bottomFade: { backgroundColor: 'rgba(242,235,221,0.66)', bottom: 0, height: ROW_HEIGHT * SIDE_ROWS, left: 0, position: 'absolute', right: 0, zIndex: 1 },
  content: { paddingVertical: ROW_HEIGHT * SIDE_ROWS },
  list: { zIndex: 2 },
  row: { alignItems: 'center', height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: spacing.md },
  value: { color: colors.subtleInk, fontSize: 16, opacity: 0.34 },
  nearValue: { color: colors.mutedInk, fontSize: 18, opacity: 0.7 },
  activeValue: { color: colors.ink, fontSize: 24, fontWeight: '800', opacity: 1 },
  unit: { color: colors.mutedInk, fontSize: 13 },
  activeUnit: { color: colors.mossDark, fontWeight: '800' },
  caption: { color: colors.mutedInk, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.xs, textAlign: 'center' },
});
