import { useCallback, useEffect, useRef, useState } from 'react';
import { openCurrentExperimentalHalfMarathonPreview, type CurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';

type PreviewState = {
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  data: CurrentExperimentalHalfMarathonPreview | null;
  error: string | null;
  /** The Plan runner context that produced data. Never render a mismatched result. */
  identity: string | null;
};

export function useExperimentalHalfMarathonPreview(enabled: boolean, refreshKey: string, evaluationDate: string | null) {
  const [state, setState] = useState<PreviewState>({ status: enabled ? 'loading' : 'disabled', data: null, error: null, identity: null });
  const requestId = useRef(0);
  const request = useCallback((identity = refreshKey) => {
    const id = ++requestId.current;
    return openCurrentExperimentalHalfMarathonPreview(evaluationDate ?? undefined)
      .then((data) => { if (requestId.current === id) setState({ status: 'ready', data, error: null, identity }); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Experimental half-marathon preview could not be opened.', identity }); });
  }, [evaluationDate, refreshKey]);
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    setState((current) => current.identity === refreshKey
      ? { ...current, status: 'loading', error: null }
      : { status: 'loading', data: null, error: null, identity: null });
    return request(refreshKey);
  }, [enabled, refreshKey, request]);
  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      return;
    }
    void request(refreshKey);
    return () => { requestId.current += 1; };
  }, [enabled, refreshKey, request]);
  // Keeping the previous result internally lets a same-identity refresh avoid
  // a flash. Expose it only when it was produced for this exact context.
  const visibleState: PreviewState = !enabled
    ? { status: 'disabled', data: null, error: null, identity: null }
    : state.identity !== refreshKey
      ? { status: 'loading', data: null, error: null, identity: null }
      : state;
  return { ...visibleState, reload };
}
