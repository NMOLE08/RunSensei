import { useCallback, useEffect, useRef, useState } from 'react';
import { openPlanAvailability, type CurrentPlanAvailability } from '@/application/planAvailability';

export function usePlanAvailability() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; data: CurrentPlanAvailability | null; error: string | null }>({ status: 'loading', data: null, error: null });
  const requestId = useRef(0);
  const read = useCallback(() => {
    const id = ++requestId.current;
    return openPlanAvailability()
      .then((data) => { if (requestId.current === id) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Plan status could not be read.' }); });
  }, []);
  const reload = useCallback(() => { setState((current) => ({ ...current, status: 'loading', error: null })); return read(); }, [read]);
  useEffect(() => { void read(); }, [read]);
  return { ...state, reload };
}
