import { Link, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, PageHeader, Screen } from '@/design/components';
import { ActivityReceipt, StateCard } from '@/features/execution/components';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { useActivityHistory } from '@/features/history/useActivityHistory';
import { trackerOnly } from '@/config/productMode';
import { useTrackerHistory } from '@/features/tracker/useTrackerHistory';
import { PendingResearchCheckinCard } from '@/features/tracker/PendingResearchCheckinCard';

function clock(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; }
function dateTime(timestamp: number) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)); }

export default function HistoryScreen() { return trackerOnly ? <TrackerHistoryScreen /> : <LegacyHistoryScreen />; }

function TrackerHistoryScreen() {
  const history = useTrackerHistory();
  if (history.status === 'loading') return <Screen><AppText variant="meta">OPENING LOCAL RUNS…</AppText></Screen>;
  if (history.status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={history.reload} title="History unavailable">Local run storage could not be opened.</StateCard></Screen>;
  return <Screen><PageHeader eyebrow="HISTORY · THIS ACCOUNT" title="Saved activities" description="Your recorded runs and walks, in one place." />
    {history.pendingCheckins.map(item => <PendingResearchCheckinCard key={`${item.activityId}:${item.assignmentId}`} checkin={item} />)}
    {history.items.length === 0 ? <StateCard title="No saved activities">Finish an outdoor run or walk and it will appear in this account’s local history.</StateCard> : history.items.map((item) => <Fragment key={item.id}><ActivityReceipt units="metric" log={{ id: item.id, previousVersionId: null, sessionId: null, actualDate: new Date(item.startedAtMs).toISOString().slice(0, 10) as `${number}-${number}-${number}`, durationSeconds: Math.round(item.activeSeconds), distanceMeters: item.distanceMeters === null ? null : Math.round(item.distanceMeters), intendedEffort: null, reportedEffort: null, source: 'gps', reasonsJson: JSON.stringify([item.mode, `Elapsed ${clock(item.elapsedSeconds)}`, dateTime(item.startedAtMs)]), concernFlagsJson: '[]', createdAt: new Date(item.endedAtMs).toISOString() }} />{item.researchFeedback && <Card><AppText variant="label">Linked workout feedback</AppText><AppText>Planned {item.researchFeedback.plannedDate} · {item.researchFeedback.status.replaceAll('_', ' ')}</AppText><AppText>Difficulty: {item.researchFeedback.difficulty?.replaceAll('_', ' ') ?? 'Not reported'} · RPE: {item.researchFeedback.rpe ?? 'Not reported'}</AppText><AppText>Fatigue: {item.researchFeedback.fatigue?.replaceAll('_', ' ') ?? 'Not reported'} · Discomfort: {item.researchFeedback.discomfort?.replaceAll('_', ' ') ?? 'Not reported'}</AppText>{item.researchFeedback.note && <AppText>Note: {item.researchFeedback.note}</AppText>}</Card>}<Button label={`Delete ${item.mode} from ${dateTime(item.startedAtMs)}`} tone="secondary" onPress={() => Alert.alert('Delete this activity?', 'Its local recording data will be removed from this phone.', [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void history.remove(item.id); } }])} /></Fragment>)}</Screen>;
}

function LegacyHistoryScreen() {
  const history = useActivityHistory(); const activePlan = useActivePlan(); const units = activePlan.data?.units ?? 'metric';
  if (history.status === 'loading') return <Screen><AppText variant="meta">OPENING RECORDED FACTS…</AppText></Screen>;
  if (history.status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={history.reload} title="History unavailable">Recorded activity facts could not be read from local storage.</StateCard></Screen>;
  return <Screen><PageHeader eyebrow="HISTORY · RECORDED FACTS" title="Training record" description="Completed work stays separate from its original prescription." />{history.logs.length === 0 ? <StateCard title="No activities recorded">History stays empty until a runner saves recorded facts.</StateCard> : history.logs.map((log) => <Fragment key={log.id}><ActivityReceipt log={log} units={units} />{log.sessionId && <Link href={{ pathname: '/log/[sessionId]', params: { sessionId: log.sessionId, corrects: log.id } } as unknown as Href} asChild><Button label="Correct this record" tone="secondary" accessibilityHint="Creates a new version without overwriting this receipt." /></Link>}</Fragment>)}</Screen>;
}
