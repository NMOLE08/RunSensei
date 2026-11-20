import { useState } from 'react';
import { View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppText, Button, Disclosure, Field } from '@/design/components';
import {
  loadBeginner5kWeeklyPreview,
  saveBeginner5kTrainingEpisode,
  saveBeginner5kWeeklyConfirmation,
} from '@/application/beginner5kWeeklyPreview';
import type { WeeklyCoverageState } from '@/data/researchWeeklyEvidenceRepository';
import { localDateOnly } from './viewModel';

export function Beginner5kWeeklyPreview({ owner, blockId }: { owner: string; blockId?: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadBeginner5kWeeklyPreview>> | null>(null);
  const [busy, setBusy] = useState(false); const [week, setWeek] = useState(1); const [nextStart, setNextStart] = useState('');
  const [choices,setChoices]=useState<Record<string,WeeklyCoverageState>>({}); const [savingWeek,setSavingWeek]=useState<string|null>(null); const [evidenceMessage,setEvidenceMessage]=useState('');
  const [episodeDate,setEpisodeDate]=useState(''); const [episodeCalendar,setEpisodeCalendar]=useState(false); const [savingEpisode,setSavingEpisode]=useState(false); const [episodeMessage,setEpisodeMessage]=useState('');
  const run = async () => { if (busy) return; setBusy(true); try { const loaded=await loadBeginner5kWeeklyPreview(owner, { evaluatedOn: localDateOnly(), week, blockId, nextStart }); setResult(loaded); if ('weeklyConfirmations' in loaded) { setChoices(Object.fromEntries(loaded.weeklyConfirmations.map(item=>[item.weekStart,item.coverage]))); setEpisodeDate(loaded.trainingEpisode?.status === 'current' ? loaded.trainingEpisode.startedOn ?? '' : ''); } } finally { setBusy(false); } };
  const saveWeek=async (weekStart:string,timezone:string) => {
    if (savingWeek) return; setSavingWeek(weekStart); setEvidenceMessage('');
    const persisted=result && 'weeklyConfirmations' in result ? result.weeklyConfirmations.find(item=>item.weekStart===weekStart) : undefined;
    const saved=await saveBeginner5kWeeklyConfirmation(owner,{weekStart,timezone,coverage:choices[weekStart] ?? persisted?.coverage ?? 'unknown',expectedRevision:persisted?.revision ?? 0,evaluatedOn:localDateOnly(),blockId,nextStart});
    if (!saved.ok) { setEvidenceMessage(saved.stale ? 'This week changed on another screen. The latest saved value has been reloaded; choose again if needed.' : saved.error.replaceAll('_',' ')); await run(); }
    else { await run(); setEvidenceMessage(`Saved ${saved.coverage.replaceAll('_',' ')} for ${weekStart}.`); }
    setSavingWeek(null);
  };
  const saveEpisode = async (startedOn: string | null) => {
    if (savingEpisode || !result || !('trainingEpisode' in result) || !('evidence' in result)) return;
    setSavingEpisode(true); setEpisodeMessage('');
    const saved = await saveBeginner5kTrainingEpisode(owner, {
      startedOn,
      timezone: result.evidence.timezone,
      expectedRevision: result.trainingEpisode?.revision ?? 0,
      evaluatedOn: localDateOnly(),
    });
    if (!saved.ok) setEpisodeMessage(saved.stale ? 'The training episode changed elsewhere. The latest saved value has been reloaded; review it before saving again.' : saved.error.replaceAll('_',' '));
    else setEpisodeMessage(saved.status === 'unknown' ? 'Training episode boundary withdrawn. Current and historical evidence remain unclassified.' : `Current training episode saved from ${saved.startedOn}.`);
    await run(); setSavingEpisode(false);
  };
  return <Disclosure title="Beginner 5K decision preview" summary="Read-only research · not approved coaching">
    <AppText>Current evidence is checked against the existing foundation rules. Saved workouts remain unchanged.</AppText>
    {blockId && <Field label="Proposed next block start (YYYY-MM-DD)" value={nextStart} onChangeText={v => { setNextStart(v); setResult(null); }} />}
    <Field label="Foundation week (1–4)" keyboardType="numeric" value={String(week)} onChangeText={v => { setWeek(Number(v)); setResult(null); }} />
    <Button disabled={busy} label={busy ? 'Checking evidence…' : 'Check weekly decision'} onPress={() => void run()} />
    {result && <><AppText variant="section">{result.kind.replaceAll('_', ' ')}</AppText>{result.reasons.map(r => <AppText key={r}>{r.replaceAll('_', ' ')}</AppText>)}
      {'evidence' in result && <><AppText>{result.evidence.foundation.currentEvidenceConfirmed ? 'Confirmed' : 'Unconfirmed'} weekly running: {result.evidence.foundation.currentWeeklyRunningSeconds === null ? 'Unknown' : `${result.evidence.foundation.currentWeeklyRunningSeconds / 60} min`} · Unreported: {result.evidence.unreportedAssignmentIds.length}</AppText>
        <Disclosure title="Training Evidence" summary="Confirm what each week represents" initiallyOpen>
          <AppText>Complete means all actual running for that week is accounted for. No Running means you explicitly confirm zero running. GPS elapsed time and prescribed guided time are not converted into running time.</AppText>
          <View style={{gap:8}}>
            <AppText variant="section">Current Training Episode</AppText>
            <AppText>{result.trainingEpisode?.status === 'current' && result.trainingEpisode.startedOn ? `Current episode starts ${result.trainingEpisode.startedOn}. Evidence before this date remains historical.` : 'Episode boundary unknown. Missing activity does not create an interruption date.'}</AppText>
            <Field label="Current episode start (YYYY-MM-DD)" value={episodeDate} onChangeText={setEpisodeDate} placeholder="YYYY-MM-DD" />
            <Button disabled={savingEpisode} label="Choose episode start" tone="quiet" onPress={()=>setEpisodeCalendar(true)} />
            {episodeCalendar && <DateTimePicker mode="date" value={/^\d{4}-\d{2}-\d{2}$/.test(episodeDate) ? new Date(`${episodeDate}T12:00:00`) : new Date()} maximumDate={new Date()} onChange={(_,selected)=>{setEpisodeCalendar(false); if(selected) setEpisodeDate(`${selected.getFullYear()}-${String(selected.getMonth()+1).padStart(2,'0')}-${String(selected.getDate()).padStart(2,'0')}`);}} />}
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
              <Button disabled={savingEpisode || !/^\d{4}-\d{2}-\d{2}$/.test(episodeDate)} label={savingEpisode?'Saving…':'Save episode boundary'} tone="secondary" onPress={()=>void saveEpisode(episodeDate)} />
              <Button disabled={savingEpisode} label="Boundary unknown" tone="quiet" onPress={()=>void saveEpisode(null)} />
            </View>
            <AppText>This date must be explicitly confirmed. It is never inferred from an empty week, and changing it does not delete historical evidence.</AppText>
            {episodeMessage ? <AppText>{episodeMessage}</AppText> : null}
          </View>
          {result.startingWorkloadComparison.ledger.weeks.map(w=>{ const persisted='weeklyConfirmations' in result ? result.weeklyConfirmations.find(item=>item.weekStart===w.start) : undefined; const selected=choices[w.start] ?? persisted?.coverage ?? 'unknown'; return <View key={w.start} style={{gap:8}}>
            <AppText variant="section">{w.start} – {w.end}</AppText>
            <AppText>{w.runningSubtotalSeconds===null ? 'No supported actual running duration recorded.' : `${w.runningSubtotalSeconds/60} min supported running recorded.`} Current confirmation: {(persisted?.coverage ?? 'unknown').replaceAll('_',' ')}.</AppText>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{(['complete','confirmed_no_running','partial','unknown'] as WeeklyCoverageState[]).map(status=><Button key={status} disabled={savingWeek!==null} label={status==='confirmed_no_running'?'No Running':status[0]!.toUpperCase()+status.slice(1)} tone={selected===status?'accent':'quiet'} onPress={()=>setChoices(old=>({...old,[w.start]:status}))}/>)}</View>
            <Button disabled={savingWeek!==null} label={savingWeek===w.start?'Saving…':'Save week status'} tone="secondary" onPress={()=>void saveWeek(w.start,w.timezone)}/>
            {selected==='complete' && w.runningSubtotalSeconds===null && <AppText>Complete cannot create running minutes. Record missing running evidence separately before this week can support an observed total.</AppText>}
          </View>;})}
          {evidenceMessage ? <AppText>{evidenceMessage}</AppText> : null}
        </Disclosure>
        <Disclosure title="Policy Readiness" summary="Evidence sufficiency · no workload selected">
          <AppText variant="section">{result.policyReadiness.overallStatus.replaceAll('_',' ')}</AppText>
          <AppText>A calculation can be available without being an appropriate or authorized training prescription.</AppText>
          {result.policyReadiness.calculations.map(calculation=><Disclosure key={calculation.method} title={calculation.method.replaceAll('_',' ')} summary={calculation.calculationAvailable?'Calculation available; prescription not authorized.':'Calculation unavailable'}>
            <AppText>{calculation.calculationAvailable&&calculation.calculatedRunningSeconds!==null?`${calculation.calculatedRunningSeconds/60} minutes running · ${calculation.formula}`:calculation.formula}</AppText>
            {calculation.explanations.map((item,index)=><AppText key={`${calculation.method}:explanation:${index}`}>{item}</AppText>)}
            {calculation.evidenceIdsUsed.length>0&&<AppText>Evidence used: {calculation.evidenceIdsUsed.join(', ')}</AppText>}
            {calculation.requiredEvidence.map((item,index)=><AppText key={`${calculation.method}:required:${index}`}>Still needed: {item}</AppText>)}
            {calculation.limitations.map((item,index)=><AppText key={`${calculation.method}:limitation:${index}`}>Limitation: {item}</AppText>)}
          </Disclosure>)}
          <AppText variant="section">Session compatibility</AppText>
          {result.policyReadiness.sessionCompatibility.map(session=><Disclosure key={session.method} title={session.method.replaceAll('_',' ')} summary={session.status.replaceAll('_',' ')}>
            <AppText>Continuous-running evidence: {session.continuousRunningSeconds===null?'Unknown':`${session.continuousRunningSeconds/60} minutes`} · Repeatability: {session.repeatabilityStatus.replaceAll('_',' ')}</AppText>
            {session.modeledSessions.map(item=><AppText key={`${session.method}:${item.slot}`}>Workout {item.slot}: {item.runningSeconds/60} min running + {item.walkingSeconds/60} min warm-up, cooldown and recovery = {item.totalSeconds/60} min total</AppText>)}
            {session.explanations.map((item,index)=><AppText key={`${session.method}:session:${index}`}>{item}</AppText>)}
            {session.requiredEvidence.map((item,index)=><AppText key={`${session.method}:session-required:${index}`}>Still needed: {item}</AppText>)}
          </Disclosure>)}
          <AppText>Research only · production eligibility false · prescription authorization false.</AppText>
        </Disclosure>
        <Disclosure title="Starting Workload Comparison" summary="Three research estimates · none selected">
          <AppText>These estimates do not change your workouts. Missing history is not zero running.</AppText>
          {result.startingWorkloadComparison.ledger.weeks.map(w => <AppText key={w.start}>{w.start} – {w.end} · {w.coverage.replaceAll('_', ' ')} · {w.runningTotalSeconds !== null ? `${w.runningTotalSeconds / 60} min running` : w.runningSubtotalSeconds !== null ? `${w.runningSubtotalSeconds / 60} min recorded subtotal; full week unknown` : 'Running unknown'} · {w.sessionCount} recorded sessions</AppText>)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {result.startingWorkloadComparison.candidates.map(c => <View key={c.method} style={{ flexGrow: 1, flexBasis: 100 }}>
              <AppText>{c.method.replaceAll('_', ' ')}</AppText>
              <AppText variant="section">{c.available ? `${c.runningSeconds! / 60} min` : 'Unavailable'}</AppText>
              <AppText>{c.formula}</AppText>
            </View>)}
          </View>
          <AppText>S = confirmed current report. Wi = complete weekly running totals. Fractional final seconds are rounded down.</AppText>
          {result.startingWorkloadComparison.findings.map(f => <AppText key={f}>{f.replaceAll('_', ' ')}</AppText>)}
          {result.startingWorkloadComparison.candidates.map(c => <Disclosure key={c.method} title={`${c.method.replaceAll('_', ' ')} · compatibility`} summary={c.compatibility?.status ?? 'Evidence unavailable'}>
            {[...c.reasons, ...(c.compatibility?.findings ?? [])].map((r,i) => <AppText key={i}>{r.replaceAll('_', ' ')}</AppText>)}
            {c.compatibility?.modeledSessions.map(s => <AppText key={s.slot}>Slot {s.slot}: {s.runningSeconds} seconds running + {s.walkingSeconds} seconds walking = {s.totalSeconds} seconds total (comparison only)</AppText>)}
          </Disclosure>)}
          <AppText>Research only. No candidate is selected or approved. A formula result is not permission to train.</AppText>
        </Disclosure>
        {result.totals && <AppText>Running {result.totals.runningSeconds / 60} min · Walking {result.totals.walkingSeconds / 60} min · Total {result.totals.scheduledSeconds / 60} min</AppText>}
        {result.workouts.map(w => <Disclosure key={w.slot} title={`${w.date} · Workout ${w.slot}`} summary={w.role}>{w.steps.map((s, i) => <AppText key={i}>{s.instruction} · {s.target.kind === 'duration_seconds' ? `${s.target.value} seconds` : 'Untimed'} · {s.effort}</AppText>)}</Disclosure>)}
        <Disclosure title="Decision evidence and rules"><AppText>{JSON.stringify({ comparison: result.startingWorkloadComparison, observations: result.evidence.observations, lineage: result.evidence.lineage, performanceFacts: result.performanceFacts, trace: result.trace, validation: result.validation, fingerprint: result.fingerprint }, null, 2)}</AppText></Disclosure>
      </>}
      <AppText>Research only. Production activation is blocked. Future stages require reassessment.</AppText>
    </>}
  </Disclosure>;
}
