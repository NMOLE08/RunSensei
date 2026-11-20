import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { deleteTrackerHistoryItem, openPendingResearchCheckins, openTrackerHistory, type PendingResearchCheckin, type TrackerHistoryItem } from '@/application/trackerHistory';

export function useTrackerHistory() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; items: TrackerHistoryItem[]; pendingCheckins: PendingResearchCheckin[] }>({ status: 'loading', items: [], pendingCheckins: [] });
  const read = useCallback(() => Promise.all([openTrackerHistory(), openPendingResearchCheckins()]).then(([items, pendingCheckins]) => setState({ status: 'ready', items, pendingCheckins })).catch(() => setState({ status: 'unavailable', items: [], pendingCheckins: [] })), []);
  const reload = useCallback(() => { setState((value) => ({ ...value, status: 'loading' })); void read(); }, [read]);
  const remove = useCallback(async (id: string) => { await deleteTrackerHistoryItem(id); await read(); }, [read]);
  useFocusEffect(useCallback(() => { void read(); }, [read]));
  return { ...state, reload, remove };
}
