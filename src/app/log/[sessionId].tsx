import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, Field, Screen } from '@/design/components';
import { recordSessionOutcomeOnDevice, type OutcomeKind } from '@/application/recordSessionOutcome';
import { displayMinutesToSeconds, displayToMeters, metersToDisplay } from '@/domain/units';
import { decodePrescription } from '@/domain/training/prescription';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { StateCard } from '@/features/execution/components';
import { encodeWorkoutFeedback, type WorkoutFeedback } from '@/domain/training/feedback';
import { markWorkoutFeedbackSaved } from '@/application/workoutTracker';
import { localDateOnly } from '@/features/execution/viewModel';
import { addWorkoutCheckpoint } from '@/application/workoutDiagnostics';

const options: { kind: OutcomeKind; label: string; description: string }[] = [
  { kind: 'as_planned', label: 'As planned', description: 'Record the activity that happened.' },
  { kind: 'partial', label: 'Partial', description: 'Record only the actual work completed.' },
  { kind: 'different_workout', label: 'Different workout', description: 'Record a different activity without changing the prescription.' },
  { kind: 'did_not_run', label: 'Did not run', description: 'Keep this skipped session available for later interruption analysis.' },
];

export default function LogSessionScreen() {
  const { sessionId, corrects, trackedId, trackedSeconds, trackedMeters, trackedMode, trackedSource, trackedDate } = useLocalSearchParams<{ sessionId: string; corrects?: string; trackedId?: string; trackedSeconds?: string; trackedMeters?: string; trackedMode?: string; trackedSource?: string; trackedDate?: string }>(); const { status, data, reload } = useActivePlan();
  const [kind, setKind] = useState<OutcomeKind>(trackedId ? (trackedMode === 'walk' ? 'different_workout' : 'partial') : 'as_planned'); const [actualDate, setActualDate] = useState(() => trackedId ? trackedDate ?? localDateOnly() : ''); const [minutes, setMinutes] = useState(trackedSeconds ? String(Math.round(Number(trackedSeconds) / 60 * 100) / 100) : ''); const [distance, setDistance] = useState(''); const [distanceEdited, setDistanceEdited] = useState(false); const [effort, setEffort] = useState(''); const [comparison, setComparison] = useState<WorkoutFeedback['comparison']>(null); const [reason, setReason] = useState(trackedMode === 'walk' ? 'Walk' : ''); const [concern, setConcern] = useState(false); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false); const submissionInFlight = useRef(false);
  useEffect(() => { if (trackedId) addWorkoutCheckpoint('feedback_opened'); }, [trackedId]);
  if (status === 'loading') return <Screen><AppText variant="meta">OPENING ACTIVITY FORM…</AppText></Screen>;
  if (status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={reload} title="Logging unavailable">Local storage could not be opened. Nothing has been recorded.</StateCard></Screen>;
  const assignment = data?.snapshot.assignments.find((item) => item.id === sessionId || item.logicalSessionId === sessionId);
  if (!data || !assignment) return <Screen><StateCard title="Session unavailable">This session is not in the current active revision.</StateCard></Screen>;
  const isSkipped = kind === 'did_not_run'; const unitLabel = data.units === 'metric' ? 'km' : 'mi'; const dateValue = actualDate || assignment.plannedDate;
  const submit = async () => {
    if (submissionInFlight.current) return;
    setError(null); const parsedMinutes = minutes.trim() === '' ? null : Number(minutes); const distanceValue = distanceEdited ? distance : trackedMeters ? String(metersToDisplay(Number(trackedMeters), data.units)) : ''; const parsedDistance = distanceValue.trim() === '' ? null : Number(distanceValue);
    if (trackedId && kind === 'did_not_run') return setError('A recorded workout cannot be marked as not done. Choose partial or different workout.');
    if (trackedMode === 'walk' && kind !== 'different_workout') return setError('A walk is saved as a different activity, not a completed run.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return setError('Enter a valid date as YYYY-MM-DD.');
    if ((parsedMinutes !== null && (!Number.isFinite(parsedMinutes) || parsedMinutes < 0)) || (parsedDistance !== null && (!Number.isFinite(parsedDistance) || parsedDistance < 0))) return setError('Duration and distance must be positive values when supplied.');
    if (kind === 'partial' && parsedMinutes === null) return setError('Partial activity requires the actual duration.');
    const exertion = effort.trim() ? Number(effort) : null;
    let reportedEffort: string | null; try { reportedEffort = isSkipped ? null : encodeWorkoutFeedback({ version: 1, exertion, comparison }); } catch { return setError('Enter a whole number from 1 to 10 for effort, or leave it blank.'); }
    submissionInFlight.current = true;
    setSubmitting(true);
    try { const result = await recordSessionOutcomeOnDevice({ planId: data.snapshot.plan.id, revisionId: data.snapshot.revision.id, logicalSessionId: assignment.logicalSessionId, actualDate: dateValue as `${number}-${number}-${number}`, kind, durationSeconds: isSkipped ? null : parsedMinutes === null ? null : displayMinutesToSeconds(parsedMinutes), distanceMeters: isSkipped ? null : parsedDistance === null ? null : displayToMeters(parsedDistance, data.units), intendedEffort: decodePrescription(assignment.prescriptionJson)?.effortCue ?? null, reportedEffort, source: trackedSource === 'gps' || trackedSource === 'timer_only' ? trackedSource : 'manual', reasons: reason.trim() ? [reason.trim()] : [], reviewedConcernFlags: concern ? ['runner_reported_concern'] : [], previousLogId: corrects ?? null, idempotencyKey: trackedId ?? `${kind}:${dateValue}` }); if (trackedId) await markWorkoutFeedbackSaved(trackedId).catch(() => undefined); if (!result.saved && !trackedId) setError('This response was already saved.'); else router.replace({ pathname: '/plan-review', params: result.reminderWarning ? { reminderWarning: result.reminderWarning } : {} } as unknown as Href); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The activity could not be saved.'); } finally { submissionInFlight.current = false; setSubmitting(false); }
  };
  return <Screen><AppText variant="meta">RECORDED FACTS / {corrects ? 'CORRECTION' : assignment.plannedDate}</AppText><AppText variant="title">What happened?</AppText>{trackedId && <AppText>Your recorded workout is saved on this device. Choose how it relates to your plan and add feedback.</AppText>}{options.filter((option) => trackedMode !== 'walk' || option.kind === 'different_workout').map((option) => <Card key={option.kind}><AppText variant="title">{option.label}</AppText><AppText>{option.description}</AppText><Button label={kind === option.kind ? 'Selected' : `Choose ${option.label}`} onPress={() => setKind(option.kind)} tone="secondary" /></Card>)}{!isSkipped && <><Field keyboardType="decimal-pad" label="Actual duration (minutes)" onChangeText={setMinutes} placeholder="Optional unless partial" value={minutes} /><Field keyboardType="decimal-pad" label={`Optional distance (${unitLabel})`} onChangeText={(value) => { setDistanceEdited(true); setDistance(value); }} placeholder="Leave blank if unknown" value={distanceEdited ? distance : trackedMeters ? String(Math.round(metersToDisplay(Number(trackedMeters), data.units) * 1000) / 1000) : ''} /><Field keyboardType="number-pad" label="How hard was it? 1 = very easy, 10 = maximum" onChangeText={setEffort} placeholder="Optional: 1–10" value={effort} /><AppText>Compared with what you expected:</AppText>{([{ value: 'easier', label: 'Easier than expected' }, { value: 'expected', label: 'As expected' }, { value: 'harder', label: 'Harder than expected' }] as const).map((option) => <Button key={option.value} label={`${comparison === option.value ? 'Selected: ' : ''}${option.label}`} onPress={() => setComparison(option.value)} tone="secondary" />)}</>}<Field label="Actual date" onChangeText={setActualDate} placeholder={assignment.plannedDate} value={actualDate} /><Field label="Reason (optional)" onChangeText={setReason} placeholder="Schedule, weather, terrain, fatigue, or other" value={reason} /><View><Button label={concern ? 'Pain or illness concern: yes' : 'Report pain or illness concern'} onPress={() => setConcern((value) => !value)} tone="secondary" /></View>{error && <AppText accessibilityLiveRegion="polite" style={{ color: '#A33' }}>{error}</AppText>}<Button label={submitting ? 'Saving…' : corrects ? 'Save correction' : 'Save recorded facts'} onPress={submitting ? undefined : submit} accessibilityHint="Saves actual activity facts and marks the recommendation for review." /><Button label="I'll answer later" onPress={() => router.back()} tone="secondary" accessibilityHint="Leaves this session unresolved without creating workout debt." /></Screen>;
}
