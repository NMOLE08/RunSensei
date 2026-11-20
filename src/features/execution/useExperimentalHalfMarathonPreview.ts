import { useCallback, useEffect, useRef, useState } from 'react';
import { openCurrentExperimentalHalfMarathonPreview, type CurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';

export function useExperimentalHalfMarathonPreview(enabled: boolean) {
  const [state, setState] = useState<{ status: 'disabled' | 'loading' | 'ready' | 'unavailable'; data: CurrentExperimentalHalfMarathonPreview | null; error: string | null }>({ status: enabled ? 'loading' : 'disabled', data: null, error: null });
  const requestId = useRef(0);
  const request = useCallback(() => {
    const id = ++requestId.current;
    return openCurrentExperimentalHalfMarathonPreview()
      .then((data) => { if (requestId.current === id) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Experimental half-marathon preview could not be opened.' }); });
  }, []);
  const reload = useCallback(() => { if (!enabled) return; setState((current) => ({ ...current, status: 'loading', error: null })); void request(); }, [enabled, request]);
  useEffect(() => { if (enabled) void request(); }, [enabled, request]);
  return { ...state, reload };
}
