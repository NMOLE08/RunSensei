import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Field, Screen } from '@/design/components';
import { recordSessionOutcomeOnDevice, type OutcomeKind } from '@/application/recordSessionOutcome';
import { displayMinutesToSeconds, displayToMeters } from '@/domain/units';
import { decodePrescription } from '@/domain/training/prescription';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { StateCard } from '@/features/execution/components';

const options: { kind: OutcomeKind; label: string; description: string }[] = [
  { kind: 'as_planned', label: 'As planned', description: 'Record the activity that happened.' },
  { kind: 'partial', label: 'Partial', description: 'Record only the actual work completed.' },
  { kind: 'different_workout', label: 'Different workout', description: 'Record a different activity without changing the prescription.' },
  { kind: 'did_not_run', label: 'Did not run', description: 'Keep this skipped session available for later interruption analysis.' },
];

export default function LogSessionScreen() {
  const { sessionId, corrects } = useLocalSearchParams<{ sessionId: string; corrects?: string }>(); const { status, data, reload } = useActivePlan();
  const [kind, setKind] = useState<OutcomeKind>('as_planned'); const [actualDate, setActualDate] = useState(''); const [minutes, setMinutes] = useState(''); const [distance, setDistance] = useState(''); const [effort, setEffort] = useState(''); const [reason, setReason] = useState(''); const [concern, setConcern] = useState(false); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING ACTIVITY FORM…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Logging unavailable">Local storage could not be opened. Nothing has been recorded.</StateCard></Screen>;
  const assignment = data?.snapshot.assignments.find((item) => item.id === sessionId || item.logicalSessionId === sessionId);
  if (!data || !assignment) return <Screen><StateCard title="Session unavailable">This session is not in the current active revision.</StateCard></Screen>;
  const isSkipped = kind === 'did_not_run'; const unitLabel = data.units === 'metric' ? 'km' : 'mi'; const dateValue = actualDate || assignment.plannedDate;
  const submit = async () => {
    setError(null); const parsedMinutes = minutes.trim() === '' ? null : Number(minutes); const parsedDistance = distance.trim() === '' ? null : Number(distance);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return setError('Enter a valid date as YYYY-MM-DD.');
    if ((parsedMinutes !== null && (!Number.isFinite(parsedMinutes) || parsedMinutes < 0)) || (parsedDistance !== null && (!Number.isFinite(parsedDistance) || parsedDistance < 0))) return setError('Duration and distance must be positive values when supplied.');
    if (kind === 'partial' && parsedMinutes === null) return setError('Partial activity requires the actual duration.');
    setSubmitting(true);
    try { const result = await recordSessionOutcomeOnDevice({ planId: data.snapshot.plan.id, revisionId: data.snapshot.revision.id, logicalSessionId: assignment.logicalSessionId, actualDate: dateValue as `${number}-${number}-${number}`, kind, durationSeconds: isSkipped ? null : parsedMinutes === null ? null : displayMinutesToSeconds(parsedMinutes), distanceMeters: isSkipped ? null : parsedDistance === null ? null : displayToMeters(parsedDistance, data.units), intendedEffort: decodePrescription(assignment.prescriptionJson)?.effortCue ?? null, reportedEffort: effort.trim() || null, source: 'manual', reasons: reason.trim() ? [reason.trim()] : [], reviewedConcernFlags: concern ? ['runner_reported_concern'] : [], previousLogId: corrects ?? null, idempotencyKey: `${kind}:${dateValue}` }); if (!result.saved) setError('This response was already saved.'); else router.replace('/history'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The activity could not be saved.'); } finally { setSubmitting(false); }
  };
  return <Screen><AppText variant="meta">RECORDED FACTS / {corrects ? 'CORRECTION' : assignment.plannedDate}</AppText><AppText variant="title">What happened?</AppText>{options.map((option) => <Card key={option.kind}><AppText variant="title">{option.label}</AppText><AppText>{option.description}</AppText><Button label={kind === option.kind ? 'Selected' : `Choose ${option.label}`} onPress={() => setKind(option.kind)} tone="secondary" /></Card>)}{!isSkipped && <><Field keyboardType="decimal-pad" label="Actual duration (minutes)" onChangeText={setMinutes} placeholder="Optional unless partial" value={minutes} /><Field keyboardType="decimal-pad" label={`Optional distance (${unitLabel})`} onChangeText={setDistance} placeholder="Leave blank if unknown" value={distance} /><Field label="Reported effort" onChangeText={setEffort} placeholder="Optional, in your own words" value={effort} /></>}<Field label="Actual date" onChangeText={setActualDate} placeholder={assignment.plannedDate} value={actualDate} /><Field label="Relevant reason" onChangeText={setReason} placeholder="Optional context" value={reason} /><View><Button label={concern ? 'Concern reviewed: yes' : 'Mark a concern for review'} onPress={() => setConcern((value) => !value)} tone="secondary" /></View>{error && <AppText accessibilityLiveRegion="polite" style={{ color: '#A33' }}>{error}</AppText>}<Button label={submitting ? 'Saving…' : corrects ? 'Save correction' : 'Save recorded facts'} onPress={submitting ? undefined : submit} accessibilityHint="Saves actual activity facts and marks the recommendation for review." /><Button label="I'll answer later" onPress={() => router.back()} tone="secondary" accessibilityHint="Leaves this session unresolved without creating workout debt." /></Screen>;
}
