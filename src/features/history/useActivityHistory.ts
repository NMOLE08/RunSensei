import { useCallback, useEffect, useState } from 'react';
import { openActivityHistory } from '@/application/activityHistory';

export function useActivityHistory() { const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; logs: Awaited<ReturnType<typeof openActivityHistory>> }>({ status: 'loading', logs: [] }); const read = useCallback(() => openActivityHistory().then((logs) => setState({ status: 'ready', logs })).catch(() => setState({ status: 'unavailable', logs: [] })), []); const reload = useCallback(() => { setState((current) => ({ ...current, status: 'loading' })); void read(); }, [read]); useEffect(() => { void read(); }, [read]); return { ...state, reload }; }
