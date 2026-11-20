import { useEffect, useRef, useState } from 'react';
import { Beginner5kWeeklyPreview } from './Beginner5kWeeklyPreview';
import type { ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { localDateOnly } from '@/features/execution/viewModel';
import { researchWorkoutSkipForNowRoute } from '@/application/researchWorkoutFlow';
import { AppText, Button, Card, Disclosure, Field } from '@/design/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { availableResearchActivities, generateNextResearchBlock, loadResearchFoundationHistory, recordResearchOutcome, reassessSavedResearchBlock, saveResearchFoundationPreview, type ResearchOutcomeInput } from '@/application/researchFoundation';
import { describeResearchBlock, type FoundationProgram, type ResearchOutcome, type ResearchReassessment } from '@/domain/planning/researchFoundation';

const blank = (): ResearchOutcomeInput => ({ status: 'completed', actualDate: null, actualDurationSeconds: null, actualRunningSeconds: null, rpe: null, difficulty: null, fatigue: null, discomfort: null, note: null });
const time = (s: number | null) => s === null ? 'Unknown' : `${Math.floor(s / 60)}m ${s % 60}s`;
const readable = (s: string) => s.replaceAll('_', ' ');
export type ResearchOutcomeRequest = { blockId: string; assignmentId: string; activityId: string };
type Props = { program: FoundationProgram; onView: (p: FoundationProgram) => void; outcomeRequest?: ResearchOutcomeRequest; focusedAssignmentId?: string; onFeedbackComplete?: () => void };
type WorkoutFact = ReturnType<typeof describeResearchBlock>[number];
type FoundationWorkout = FoundationProgram['workouts'][number];

/** Keeps the editor beside the workout that opened it, so the action has an immediate visible result. */
export function ResearchWorkoutOutcomeRow({ fact, workout, title, editing, expanded, outcomes, onEdit, onExpandedChange, onStart, onSkip, editor }: {
  fact: WorkoutFact;
  workout: FoundationWorkout;
  title: string;
  editing: boolean;
  expanded: boolean;
  outcomes: ResearchOutcome[];
  onEdit: (assignmentId: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  onStart: (assignmentId: string) => void;
  onSkip: (assignmentId: string, plannedDate: string) => void;
  editor?: ReactNode;
}) {
  return <Disclosure title={title} summary={fact.status === 'unreported' ? 'UNREPORTED — No outcome recorded' : readable(fact.status)} expanded={expanded || editing} onExpandedChange={onExpandedChange}>
    <AppText>{fact.assignment.plannedDate} · Planned {time(fact.assignment.durationSeconds)}</AppText>
    {workout.steps.map((step, index) => <AppText key={`${fact.assignment.assignmentId}:step:${index}`}>{step.kind === 'warmup' ? 'Warm-up' : step.kind === 'cooldown' ? 'Cooldown' : step.kind === 'recovery' ? 'Walking recovery' : 'Main running'} · {step.instruction} · {step.target.kind === 'duration_seconds' ? time(step.target.value) : 'Unknown duration'}{step.repeats > 1 ? ` · ${step.repeats} repeats` : ''}</AppText>)}
    <AppText>Total estimated duration: {time(fact.assignment.durationSeconds)}</AppText>
    {fact.status === 'unreported' && !editing && <Button label="Start workout" onPress={() => onStart(fact.assignment.assignmentId)} accessibilityHint="Starts the existing GPS run recorder. The workout outcome stays unreported until you submit feedback." />}
    {(fact.outcome || fact.assignment.plannedDate < localDateOnly()) && <Button label={fact.outcome ? 'Correct workout feedback' : 'Log a previous workout'} tone="secondary" onPress={() => onEdit(fact.assignment.assignmentId)} />}
    {fact.status === 'unreported' && fact.assignment.plannedDate < localDateOnly() && <Button label="Mark as skipped" tone="quiet" onPress={() => onSkip(fact.assignment.assignmentId, fact.assignment.plannedDate)} />}
    {fact.outcome && <AppText>Actual total: {time(fact.outcome.record.actualDurationSeconds)} · Actual running-only time: {time(fact.outcome.record.actualRunningSeconds)}</AppText>}
    {fact.outcome?.guidedExecution && <Disclosure title="Guided phase completion" summary={`${fact.outcome.guidedExecution.completedPhases.length} phases recorded`}>
      {workout.steps.flatMap((step, sourceIndex) => Array.from({ length: step.repeats }, (_, repetitionIndex) => ({ step, sourceIndex, repetitionIndex }))).map(({ step, sourceIndex, repetitionIndex }, index) => {
        const phaseId = `${fact.assignment.assignmentId}:phase:${sourceIndex + 1}:${repetitionIndex + 1}`;
        const completion = fact.outcome!.guidedExecution!.completedPhases.find(value => value.phaseId === phaseId);
        return <AppText key={phaseId}>{index + 1}. {step.instruction} · {completion ? `${time(completion.actualSeconds)} · ${completion.completion.replaceAll('_', ' ')}` : 'not completed'}</AppText>;
      })}
      <AppText>Phase time is execution evidence. GPS records route and total active time; it does not detect gait.</AppText>
    </Disclosure>}
    {editing && editor}
    <Disclosure title="Evidence and correction history">{outcomes.map(o => <AppText key={o.id}>{o.id} · replaces {o.previousVersionId ?? 'none'} · {o.removed ? 'association removed' : o.record.status}</AppText>)}<AppText>{fact.analysis?.dataQualityIssues.join(', ') || 'Missing values remain unknown.'}</AppText></Disclosure>
  </Disclosure>;
}

export function ResearchFoundationProgress(props: Props) {
  const { user } = useAuth();
  return experimental5kPreviewEnabled && user ? <Editor key={user.id} owner={user.id} {...props} /> : null;
}
function Editor({ owner, program, onView, outcomeRequest, focusedAssignmentId, onFeedbackComplete }: Props & { owner: string }) {
  const router = useRouter(); const alive = useRef(true); const locked = useRef(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadResearchFoundationHistory>>>([]);
  const [selected, setSelected] = useState<string | null>(null); const [editing, setEditing] = useState<string | null>(null);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null); const [statusSelected, setStatusSelected] = useState(false);
  const [input, setInput] = useState(blank); const [activityId, setActivityId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Awaited<ReturnType<typeof availableResearchActivities>>>([]);
  const [showRunningTime, setShowRunningTime] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [nextStart, setNextStart] = useState(''); const [decision, setDecision] = useState<ResearchReassessment | null>(null);
  const current = history.find(h => h.block.id === selected);
  const refresh = async () => { const data = await loadResearchFoundationHistory(owner); if (alive.current) setHistory(data); return data; };
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void refresh().then(async data => {
      if (cancelled) return;
      const target = outcomeRequest ? data.find(h => h.block.id === outcomeRequest.blockId) : null;
      if (outcomeRequest && !target) { setError('The research workout is not available for this account. The saved GPS activity remains in History.'); return; }
      const selectedBlock = target ?? data.find(h => JSON.stringify(h.block.program) === JSON.stringify(program));
      if (!selectedBlock) return;
      setSelected(selectedBlock.block.id);
      if (!outcomeRequest) return;
      if (!selectedBlock.block.assignments.some(a => a.assignmentId === outcomeRequest.assignmentId)) { setError('The workout does not belong to this saved research block. The GPS activity remains in History.'); return; }
      const existing = describeResearchBlock(selectedBlock.block, selectedBlock.outcomes).find(f => f.assignment.assignmentId === outcomeRequest.assignmentId)?.outcome;
      setError(null); setEditing(outcomeRequest.assignmentId); setExpandedAssignment(outcomeRequest.assignmentId); setActivityId(null); setShowRunningTime(Boolean(existing?.record.actualRunningSeconds));
      setInput(existing && !existing.removed ? { ...existing.record } : blank()); setStatusSelected(Boolean(existing && !existing.removed));
      const activities = await availableResearchActivities(owner);
      if (cancelled) return;
      setActivities(activities);
      const activity = activities.find(a => a.id === outcomeRequest.activityId);
      if (!activity) { setActivityId(null); setError('The saved GPS activity is not available for this account. It remains in History and was not linked.'); return; }
      setActivityId(activity.id); setInput(value => ({ ...value, actualDate: activity.actualDate, actualDurationSeconds: activity.durationSeconds, actualRunningSeconds: null }));
    }).catch(e => { if (!cancelled) setError(readable(e instanceof Error ? e.message : String(e))); });
    return () => { alive.current = false; cancelled = true; };
  }, [owner, program, outcomeRequest?.blockId, outcomeRequest?.assignmentId, outcomeRequest?.activityId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(action: () => Promise<void>) {
    if (locked.current) return; locked.current = true; setBusy(true); setError(null);
    try { await action(); } catch (e) { if (alive.current) setError(readable(e instanceof Error ? e.message : String(e))); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function latest(id: string) { const rows = current?.outcomes ?? []; const superseded = new Set(rows.map(o => o.previousVersionId)); return rows.find(o => o.assignmentId === id && !superseded.has(o.id)); }
  function edit(id: string) {
    const old = latest(id); setEditing(id); setExpandedAssignment(id); setStatusSelected(Boolean(old && !old.removed)); setShowRunningTime(Boolean(old?.record.actualRunningSeconds)); setInput(old && !old.removed ? { ...old.record } : blank()); setActivityId(old?.associatedActivityId ?? null);
    void run(async () => { const values = await availableResearchActivities(owner); if (alive.current) setActivities(values); });
  }
  function start(id: string) {
    if (!current || !current.block.assignments.some(a => a.assignmentId === id)) return;
    router.push({ pathname: '/research-guided/[blockId]/[assignmentId]', params: { blockId: current.block.id, assignmentId: id } } as unknown as Href);
  }
  async function skip(id: string, plannedDate: string) {
    if (!current || plannedDate >= localDateOnly()) return;
    await run(async () => {
      const skipped: ResearchOutcomeInput = { ...blank(), status: 'missed', actualDate: plannedDate };
      await recordResearchOutcome(owner, current.block.id, id, latest(id)?.id ?? null, skipped);
      await refresh(); setEditing(null); setStatusSelected(false);
    });
  }
  async function save(remove = false) {
    if (!current || !editing) return;
    if (!remove && !statusSelected) throw new Error('Choose whether you completed the workout, partially completed it, or did a different activity.');
    if (!remove && input.status !== 'missed' && (!input.difficulty || input.fatigue === null || input.discomfort === null)) throw new Error('Answer the difficulty and fatigue or discomfort questions before saving.');
    if (!remove && !input.actualDate) throw new Error('Enter the date of the workout before saving.');
    await recordResearchOutcome(owner, current.block.id, editing, latest(editing)?.id ?? null, input, activityId, remove);
    await refresh(); if (alive.current) { setEditing(null); setStatusSelected(false); setDecision(null); if (activityId?.startsWith('tracking:')) onFeedbackComplete?.(); }
  }
  const allFacts = current ? describeResearchBlock(current.block, current.outcomes) : [];
  const facts = focusedAssignmentId ? allFacts.filter(f => f.assignment.assignmentId === focusedAssignmentId) : allFacts;
  return <Card><AppText variant="title">{focusedAssignmentId ? 'Workout finished! How did it go?' : 'Research workout journal'}</AppText><AppText>{focusedAssignmentId ? 'Your GPS activity is saved. The workout stays unreported until you save feedback.' : 'Experimental, not approved coaching. Records stay on this device, separate from active plans. Viewing a block never completes a workout.'}</AppText>
    {error && !editing && <AppText accessibilityRole="alert">{error}</AppText>}
    {!focusedAssignmentId && program.goalFamily === '5k' && <Beginner5kWeeklyPreview key={JSON.stringify([owner, selected, current?.outcomes])} owner={owner} blockId={current?.block.id} />}
    {!focusedAssignmentId && <Button disabled={busy} label="Save this research block" onPress={() => void run(async () => { const b = await saveResearchFoundationPreview(owner, program); await refresh(); if (alive.current) setSelected(b.id); })} />}
    {!focusedAssignmentId && <Disclosure title="Saved research blocks" summary={`${history.length} blocks`}>
      {history.map(h => <Button key={h.block.id} label={`${h.block.assignments[0]?.plannedDate} · ${h.block.parentBlockId ? 'Next' : 'Original'} foundation`} onPress={() => { setSelected(h.block.id); setEditing(null); setDecision(null); onView(h.block.program); }} />)}
    </Disclosure>}
    {current && <>{!focusedAssignmentId && <AppText>{facts.filter(f => f.status === 'completed').length} completed · {facts.filter(f => f.status === 'partial').length} partial · {facts.filter(f => f.status === 'missed').length} skipped · {facts.filter(f => f.status === 'unreported').length} unreported</AppText>}
      {facts.map(f => {
        const assignmentId = f.assignment.assignmentId;
        const workoutIndex = allFacts.findIndex(value => value.assignment.assignmentId === assignmentId);
        const workout = current.block.program.workouts[workoutIndex]!;
        const savedActivity = activities.find(a => a.id === activityId);
        const postWorkout = Boolean(savedActivity && activityId?.startsWith('tracking:'));
        return <ResearchWorkoutOutcomeRow key={assignmentId} fact={f} workout={workout} outcomes={current.outcomes.filter(o => o.assignmentId === assignmentId)} title={`Week ${workout.week} · Workout ${workout.slot}`} editing={editing === assignmentId} expanded={expandedAssignment === assignmentId} onExpandedChange={open => setExpandedAssignment(open ? assignmentId : null)} onEdit={edit} onStart={start} onSkip={(id, date) => void skip(id, date)} editor={editing === assignmentId ? <Card>
          {!focusedAssignmentId && <AppText variant="label">Record workout feedback</AppText>}
          {error && <AppText accessibilityRole="alert">{error}</AppText>}
          {postWorkout && savedActivity && <AppText>Saved GPS activity · {savedActivity.actualDate} · {time(savedActivity.durationSeconds)} recorded. GPS does not confirm workout completion or running-only time.</AppText>}
          <AppText>Did you complete the planned workout?</AppText>
          {(['completed', 'partial', 'different_activity'] as const).map(status => <Button key={status} tone={statusSelected && input.status === status ? 'primary' : 'secondary'} label={`${statusSelected && input.status === status ? '✓ ' : ''}${status === 'completed' ? 'Yes, completed' : status === 'partial' ? 'Partially completed' : 'Did a different activity'}`} onPress={() => { setStatusSelected(true); setInput(v => ({ ...v, status })); }} />)}
          {statusSelected && input.status !== 'missed' && <>
            <AppText>How difficult did it feel?</AppText>
            {(['too_easy', 'comfortable', 'challenging', 'too_difficult'] as const).map(difficulty => <Button key={difficulty} tone={input.difficulty === difficulty ? 'primary' : 'secondary'} label={`${input.difficulty === difficulty ? '✓ ' : ''}${difficulty === 'too_easy' ? 'Too easy' : difficulty === 'comfortable' ? 'Comfortable' : difficulty === 'challenging' ? 'Challenging' : 'Too difficult'}`} onPress={() => setInput(v => ({ ...v, difficulty }))} />)}
            <AppText>Any unusual fatigue or discomfort?</AppText>
            {(['none', 'unusual'] as const).map(fatigue => <Button key={fatigue} tone={input.fatigue === fatigue ? 'primary' : 'secondary'} label={`${input.fatigue === fatigue ? '✓ ' : ''}${fatigue === 'none' ? 'No unusual fatigue' : 'Unusual fatigue'}`} onPress={() => setInput(v => ({ ...v, fatigue }))} />)}
            {(['none', 'pain_or_injury_concern'] as const).map(discomfort => <Button key={discomfort} tone={input.discomfort === discomfort ? 'primary' : 'secondary'} label={`${input.discomfort === discomfort ? '✓ ' : ''}${discomfort === 'none' ? 'No discomfort' : 'Pain or injury concern'}`} onPress={() => setInput(v => ({ ...v, discomfort }))} />)}
            {savedActivity ? <>
              {!postWorkout && <Button label="Remove linked activity" tone="quiet" onPress={() => { setActivityId(null); setInput(v => ({ ...v, actualDate: null, actualDurationSeconds: null, actualRunningSeconds: null })); }} />}
              {!postWorkout && <Disclosure title="Correct recorded values">
                <Field label="Activity date (YYYY-MM-DD)" value={input.actualDate ?? savedActivity.actualDate} onChangeText={actualDate => setInput(v => ({ ...v, actualDate }))} />
                <Field label="Total recorded seconds" keyboardType="numeric" value={input.actualDurationSeconds?.toString() ?? String(savedActivity.durationSeconds)} onChangeText={s => setInput(v => ({ ...v, actualDurationSeconds: s.trim() ? Number(s) : null }))} />
                <Button label={showRunningTime ? 'Running-only time is unknown' : 'Add running-only time'} tone="quiet" onPress={() => setShowRunningTime(v => !v)} />
                {showRunningTime && <Field label="Running-only seconds (optional; do not include walking)" keyboardType="numeric" value={input.actualRunningSeconds?.toString() ?? ''} onChangeText={s => setInput(v => ({ ...v, actualRunningSeconds: s.trim() ? Number(s) : null }))} />}
              </Disclosure>}
            </> : <>
              <Field label="Workout date (YYYY-MM-DD)" value={input.actualDate ?? ''} onChangeText={actualDate => setInput(v => ({ ...v, actualDate }))} />
              <Field label="Actual total seconds (optional)" keyboardType="numeric" value={input.actualDurationSeconds?.toString() ?? ''} onChangeText={s => setInput(v => ({ ...v, actualDurationSeconds: s.trim() ? Number(s) : null }))} /><Button label={showRunningTime ? 'Hide running-only time' : 'Add running-only time'} tone="quiet" onPress={() => setShowRunningTime(v => !v)} />{showRunningTime && <Field label="Actual running seconds only" keyboardType="numeric" value={input.actualRunningSeconds?.toString() ?? ''} onChangeText={s => setInput(v => ({ ...v, actualRunningSeconds: s.trim() ? Number(s) : null }))} />}
              <Disclosure title="Link an existing saved activity" summary="Optional · existing Torto activity only"><Button label="Use manual evidence instead" onPress={() => setActivityId(null)} />{activities.map(a => <Button key={a.id} label={`${a.actualDate} · ${time(a.durationSeconds)}${a.id === activityId ? ' · Selected' : ''}`} onPress={() => { setActivityId(a.id); setInput(v => ({ ...v, actualDate: a.actualDate, actualDurationSeconds: a.durationSeconds, actualRunningSeconds: null })); }} />)}<AppText>Linked metrics are read from the saved activity. Running-only time stays unknown unless you report it.</AppText></Disclosure>
            </>}
            <Disclosure title="Optional effort score"><Field label="RPE 1–10 (1 very easy, 10 maximal)" keyboardType="numeric" value={input.rpe?.toString() ?? ''} onChangeText={s => setInput(v => ({ ...v, rpe: s.trim() ? Number(s) : null }))} /></Disclosure>
            <Field label="Notes (optional)" value={input.note ?? ''} onChangeText={note => setInput(v => ({ ...v, note }))} />
          </>}
          <Button disabled={busy || !statusSelected || (input.status !== 'missed' && (!input.difficulty || input.fatigue === null || input.discomfort === null)) || !input.actualDate} label="Save workout feedback" onPress={() => void run(() => save())} />
          {latest(assignmentId) && <Button disabled={busy} label="Remove association; preserve history" tone="secondary" onPress={() => void run(() => save(true))} />}
          <Button label="Cancel" tone="quiet" onPress={() => { setEditing(null); setError(null); }} />
          {postWorkout && <Button disabled={busy} label="Skip for now" tone="quiet" accessibilityHint="Keeps the GPS activity saved and leaves this workout outcome unreported." onPress={() => router.replace(researchWorkoutSkipForNowRoute() as Href)} />}
        </Card> : null} />;
      })}
      {!focusedAssignmentId && <Disclosure title="Saved reassessments" summary={`${current.decisions.length} historical decisions`}>
        {current.decisions.map((d, i) => <AppText key={i}>{d.evaluatedAt} · {readable(d.decision.kind)} · {d.decision.reasonCodes.map(readable).join('; ')} · {d.decision.policyReference}</AppText>)}
        <AppText>Historical decisions describe the evidence at that time. Reassess again before requesting a new block.</AppText>
      </Disclosure>}
      {!focusedAssignmentId && <>
      <AppText>After the block, explicitly confirm current capability. Completion alone does not increase training.</AppText>
      <AppText>Review the running values, then use “confirm current today” only if they describe what you can repeat now. Save changes and reopen this saved block.</AppText>
      <Button label="Review and confirm current capacity" tone="secondary" onPress={() => router.push('/onboarding/running?returnTo=/plan' as never)} />
      <Field label="Requested next block start (YYYY-MM-DD)" value={nextStart} onChangeText={setNextStart} />
      <Button disabled={busy} label="Reassess research block" onPress={() => void run(async () => { const result = await reassessSavedResearchBlock(owner, current.block.id, nextStart); if (alive.current) setDecision(result.decision); })} />
      {decision && <><AppText variant="section">{readable(decision.transition ?? decision.kind)}</AppText>{decision.reasonCodes.map(r => <AppText key={r}>{readable(r)}</AppText>)}{decision.healthHold && <AppText>Health review required. Progression is held; seek appropriate clinical advice for concerning symptoms.</AppText>}<AppText>Draft decision only. Production activation blocked.</AppText>{decision.kind === 'next_block' && <Button disabled={busy} label="Save and view next research block" onPress={() => void run(async () => { const b = await generateNextResearchBlock(owner, current.block.id, nextStart); await refresh(); if (alive.current) { setSelected(b.id); setDecision(null); onView(b.program); } })} />}</>}
      </>}
    </>}
  </Card>;
}
