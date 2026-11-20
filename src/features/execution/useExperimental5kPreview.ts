import { useCallback, useEffect, useState } from 'react';
import { openCurrentExperimental5kPreview, type CurrentExperimental5kPreview } from '@/application/experimental5kPreview';

function localDateOnly() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }

export function useExperimental5kPreview(enabled: boolean) {
  const [state, setState] = useState<{ status: 'disabled' | 'loading' | 'ready' | 'unavailable'; data: CurrentExperimental5kPreview | null; error: string | null }>({ status: enabled ? 'loading' : 'disabled', data: null, error: null });
  const request = useCallback(() => openCurrentExperimental5kPreview(localDateOnly()).then((data) => setState({ status: 'ready', data, error: null })).catch((error: unknown) => setState({ status: 'unavailable', data: null, error: error instanceof Error ? error.message : 'Experimental preview could not be opened.' })), []);
  const reload = useCallback(() => { if (!enabled) return; setState((current) => ({ ...current, status: 'loading', error: null })); void request(); }, [enabled, request]);
  useEffect(() => { if (enabled) void request(); }, [enabled, request]);
  return { ...state, reload };
}
