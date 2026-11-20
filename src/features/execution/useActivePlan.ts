import { useCallback, useEffect, useRef, useState } from 'react';
import { openActivePlan } from '@/application/activePlan';

export function useActivePlan() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; data: Awaited<ReturnType<typeof openActivePlan>>; error: string | null }>({ status: 'loading', data: null, error: null });
  const requestId = useRef(0);
  const read = useCallback(() => {
    const id = ++requestId.current;
    return openActivePlan()
      .then((data) => { if (requestId.current === id) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Local storage is unavailable.' }); });
  }, []);
  const reload = useCallback(() => { setState((current) => ({ ...current, status: 'loading', error: null })); return read(); }, [read]);
  useEffect(() => { void read(); }, [read]);
  return { ...state, reload };
}
