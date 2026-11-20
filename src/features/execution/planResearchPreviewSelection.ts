import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import type { CurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';

export type HalfPreviewSnapshot = Readonly<{
  status: 'disabled' | 'loading' | 'ready' | 'unavailable';
  data: CurrentExperimentalHalfMarathonPreview | null;
  error: string | null;
  identity: string | null;
  source: 'half_marathon' | 'foundation' | 'not_applicable' | null;
}>;

export type ResearchPreviewSelection =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; value: CurrentExperimentalHalfMarathonPreview; foundation: boolean };

/**
 * The Plan-screen branch gate. It is intentionally identity-aware: a retained
 * response is never a fallback for a different account, goal, or assessment.
 */
export function selectResearchPreview(
  enabled: boolean,
  goal: FitnessAssessmentDraft['goal'] | null,
  currentIdentity: string,
  state: HalfPreviewSnapshot,
): ResearchPreviewSelection {
  if (!enabled) return { kind: 'none' };
  if (state.identity !== currentIdentity) {
    return goal === 'half_marathon' && state.status === 'loading' ? { kind: 'loading' } : { kind: 'none' };
  }
  const value = state.data;
  if (goal === 'half_marathon') {
    if (value && state.source !== 'not_applicable') return { kind: 'preview', value, foundation: state.source === 'foundation' };
    if (state.status === 'loading') return { kind: 'loading' };
    if (state.status === 'unavailable') return { kind: 'error', message: state.error ?? 'The research preview could not be checked. No draft workouts are shown until it is available.' };
    return { kind: 'none' };
  }
  if (!value || goal === null || goal === 'habit' || state.source !== 'foundation') return { kind: 'none' };
  if (value.kind === 'foundation_program' || value.kind === 'blocked' || value.kind === 'unavailable') return { kind: 'preview', value, foundation: true };
  return { kind: 'none' };
}
