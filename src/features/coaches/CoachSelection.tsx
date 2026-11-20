import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card } from '@/design/components';
import { colors, spacing } from '@/design/tokens';
import { canConfirmCoach, type CoachId } from '@/domain/coachSelection';
import { mascotMouthStateAt } from '@/domain/mascotLipSync';
import { coachDefinitions } from './mascotAssets';
import { TalkingMascot } from './TalkingMascot';
import { useCoachIntroduction } from './useCoachIntroduction';
import { presentMentor } from './mentorPresentation';

export function CoachSelection({ initialCoach, initialIntroductionAcknowledged, busy, persistenceError, onSelectionChange, onIntroductionSatisfied, onConfirm }: { initialCoach: CoachId | null; initialIntroductionAcknowledged: boolean; busy: boolean; persistenceError: string | null; onSelectionChange: (coach: CoachId) => void; onIntroductionSatisfied: (coach: CoachId) => void; onConfirm: (coach: CoachId) => Promise<void> }) {
  const [selected, setSelected] = useState<CoachId | null>(initialCoach); const [satisfied, setSatisfied] = useState<ReadonlySet<CoachId>>(() => new Set(initialCoach && initialIntroductionAcknowledged ? [initialCoach] : []));
  const markSatisfied = useCallback((coachId: CoachId) => { setSatisfied((current) => new Set([...current, coachId])); onIntroductionSatisfied(coachId); }, [onIntroductionSatisfied]);
  const introduction = useCoachIntroduction(markSatisfied);
  const select = (coachId: CoachId) => { setSelected(coachId); setSatisfied((current) => { const next = new Set(current); next.delete(coachId); return next; }); onSelectionChange(coachId); void introduction.play(coachId); };
  const skip = () => { if (!selected) return; void introduction.stop(); markSatisfied(selected); };
  const activeDefinition = introduction.snapshot.coachId ? coachDefinitions[introduction.snapshot.coachId] : null;
  const activeMouth = activeDefinition && (introduction.snapshot.status === 'playing') ? mascotMouthStateAt(activeDefinition.timeline, introduction.nativeStatus.currentTime) : 'X';
  const selectedDefinition = selected ? coachDefinitions[selected] : null; const presentation = selected ? presentMentor(selected, 'selection') : null; const confirmable = canConfirmCoach(selected, satisfied);
  return <View style={styles.root}>
    <View accessibilityRole="radiogroup" style={styles.coaches}>{(['moss', 'jett'] as const).map((coachId) => <TalkingMascot coach={coachDefinitions[coachId]} key={coachId} mouth={introduction.snapshot.coachId === coachId ? activeMouth : 'X'} onPress={() => select(coachId)} selected={selected === coachId} />)}</View>
    {selectedDefinition && presentation ? <Card tone={selected === 'moss' ? 'moss' : 'coral'}><AppText variant="title">{selectedDefinition.name}</AppText><AppText variant="label">{presentation.title}</AppText><AppText>{presentation.description}</AppText><AppText style={styles.shared}>{presentation.sharedCoachingNote}</AppText><AppText variant="meta">INTRODUCTION SUBTITLES</AppText><AppText style={styles.unavailable}>A verified transcript is not available yet. No dialogue has been invented for this build.</AppText><View style={styles.actions}><Button label="Replay introduction" tone="secondary" onPress={() => { void introduction.play(selectedDefinition.id); }} /><Button label="Skip intro" tone="quiet" onPress={skip} /></View>{introduction.snapshot.coachId === selected && <AppText variant="meta">AUDIO · {introduction.snapshot.status.toUpperCase()} · {introduction.nativeStatus.currentTime.toFixed(1)} / {selectedDefinition.timeline.durationSeconds.toFixed(1)} S</AppText>}{introduction.error && <AppText accessibilityLiveRegion="assertive" style={styles.error}>{introduction.error}</AppText>}</Card> : <Card tone="soft"><AppText>Select Moss or Jett to hear their introduction. Nothing plays automatically.</AppText></Card>}
    <Button disabled={!confirmable || busy} label={selected ? `Confirm ${coachDefinitions[selected].name}` : 'Choose a coach'} onPress={() => { if (selected && confirmable) void onConfirm(selected); }} />
    {!confirmable && selected && <AppText style={styles.note}>Finish the introduction or choose Skip Intro before confirming.</AppText>}{persistenceError && <AppText accessibilityLiveRegion="assertive" style={styles.error}>{persistenceError}</AppText>}
  </View>;
}

const styles = StyleSheet.create({ root: { gap: spacing.md }, coaches: { flexDirection: 'row', gap: spacing.sm }, actions: { gap: spacing.xs }, unavailable: { color: colors.mutedInk }, shared: { color: colors.mutedInk, fontStyle: 'italic' }, note: { color: colors.mutedInk, textAlign: 'center' }, error: { color: colors.error } });
