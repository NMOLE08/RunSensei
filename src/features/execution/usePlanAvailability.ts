import { useCallback, useEffect, useRef, useState } from 'react';
import { openPlanAvailability, type CurrentPlanAvailability } from '@/application/planAvailability';

export function usePlanAvailability() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable'; data: CurrentPlanAvailability | null; error: string | null }>({ status: 'loading', data: null, error: null });
  const requestId = useRef(0);
  const read = useCallback((regenerate: boolean) => {
    const id = ++requestId.current;
    return openPlanAvailability({ regenerate })
      .then((data) => { if (requestId.current === id) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Plan status could not be read.' }); });
  }, []);
  const reload = useCallback((options: { regenerate?: boolean } = {}) => {
    setState((current) => ({ ...current, status: 'loading', error: null }));
    return read(options.regenerate === true);
  }, [read]);
  useEffect(() => { void read(false); }, [read]);
  return { ...state, reload };
}
