import { useCallback, useEffect, useState } from 'react';

import { deleteTrackerHistoryItem, openTrackerHistory, type TrackerHistoryItem } from '@/application/trackerHistory';

export function useTrackerHistory() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; items: TrackerHistoryItem[] }>({ status: 'loading', items: [] });
  const read = useCallback(() => openTrackerHistory().then((items) => setState({ status: 'ready', items })).catch(() => setState({ status: 'unavailable', items: [] })), []);
  const reload = useCallback(() => { setState((value) => ({ ...value, status: 'loading' })); void read(); }, [read]);
  const remove = useCallback(async (id: string) => { await deleteTrackerHistoryItem(id); await read(); }, [read]);
  useEffect(() => { void read(); }, [read]);
  return { ...state, reload, remove };
}
