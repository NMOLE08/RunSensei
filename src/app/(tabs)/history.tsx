import { Link, type Href } from 'expo-router';
import { Fragment } from 'react';
import { AppText, Button, Screen } from '@/design/components';
import { ActivityReceipt, StateCard } from '@/features/execution/components';
import { useActivePlan } from '@/features/execution/useActivePlan';
import { useActivityHistory } from '@/features/history/useActivityHistory';

export default function HistoryScreen() {
  const history = useActivityHistory(); const activePlan = useActivePlan(); const units = activePlan.data?.units ?? 'metric';
  if (history.status === 'loading') return <Screen><AppText variant="meta">OPENING RECORDED FACTS…</AppText></Screen>;
  if (history.status === 'unavailable') return <Screen><StateCard actionLabel="Try again" onAction={history.reload} title="History unavailable">Recorded activity facts could not be read from local storage.</StateCard></Screen>;
  return <Screen><AppText variant="meta">HISTORY / RECORDED FACTS</AppText><AppText variant="title">Training record</AppText>{history.logs.length === 0 ? <StateCard title="No activities recorded">History stays empty until a runner saves recorded facts.</StateCard> : history.logs.map((log) => <Fragment key={log.id}><ActivityReceipt log={log} units={units} />{log.sessionId && <Link href={{ pathname: '/log/[sessionId]', params: { sessionId: log.sessionId, corrects: log.id } } as unknown as Href} asChild><Button label="Correct this record" tone="secondary" accessibilityHint="Creates a new version without overwriting this receipt." /></Link>}</Fragment>)}</Screen>;
}
