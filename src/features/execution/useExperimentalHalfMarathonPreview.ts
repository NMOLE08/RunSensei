import { useCallback, useEffect, useRef, useState } from 'react';
import { openCurrentExperimentalHalfMarathonPreviewWithProvenance, type CurrentExperimentalHalfMarathonPreview, type CurrentExperimentalHalfMarathonPreviewResponse } from '@/application/experimentalHalfMarathonPreview';
import { planPreviewIdentityKey, samePlanPreviewIdentity, type PlanPreviewIdentity } from '@/application/planPreviewIdentity';

type PreviewState = {
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  data: CurrentExperimentalHalfMarathonPreview | null;
  error: string | null;
  /** The Plan runner context that produced data. Never render a mismatched result. */
  identity: string | null;
  source: CurrentExperimentalHalfMarathonPreviewResponse['source'] | null;
};

export function resolveExperimentalPreviewResponse(requested: PlanPreviewIdentity, response: CurrentExperimentalHalfMarathonPreviewResponse): PreviewState {
  const identity = planPreviewIdentityKey(requested);
  if (!samePlanPreviewIdentity(requested, response.previewContext)) {
    return { status: 'unavailable', data: null, error: 'Saved runner information changed while the research preview was loading. Please try again.', identity, source: null };
  }
  return { status: 'ready', data: response.value, error: null, identity, source: response.source };
}

export function useExperimentalHalfMarathonPreview(enabled: boolean, requested: PlanPreviewIdentity | null) {
  const refreshKey = requested ? planPreviewIdentityKey(requested) : 'loading';
  const evaluationDate = requested?.evaluationDate ?? null;
  const [state, setState] = useState<PreviewState>({ status: enabled ? 'loading' : 'disabled', data: null, error: null, identity: null, source: null });
  const requestId = useRef(0);
  const request = useCallback((requestContext: PlanPreviewIdentity) => {
    const identity = planPreviewIdentityKey(requestContext);
    const id = ++requestId.current;
    return openCurrentExperimentalHalfMarathonPreviewWithProvenance(evaluationDate ?? undefined)
      .then((response) => { if (requestId.current === id) setState(resolveExperimentalPreviewResponse(requestContext, response)); })
      .catch((error: unknown) => { if (requestId.current === id) setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Experimental half-marathon preview could not be opened.', identity, source: null }); });
  }, [evaluationDate]);
  const reload = useCallback(() => {
    if (!enabled || !requested) return Promise.resolve();
    setState((current) => current.identity === refreshKey
      ? { ...current, status: 'loading', error: null }
      : { status: 'loading', data: null, error: null, identity: null, source: null });
    return request(requested);
  }, [enabled, refreshKey, request, requested]);
  useEffect(() => {
    if (!enabled || !requested) {
      requestId.current += 1;
      return;
    }
    void request(requested);
    return () => { requestId.current += 1; };
  }, [enabled, refreshKey, request, requested]);
  // Keeping the previous result internally lets a same-identity refresh avoid
  // a flash. Expose it only when it was produced for this exact context.
  const visibleState: PreviewState = !enabled
    ? { status: 'disabled', data: null, error: null, identity: null, source: null }
    : state.identity !== refreshKey
      ? { status: 'loading', data: null, error: null, identity: null, source: null }
      : state;
  return { ...visibleState, reload };
}
