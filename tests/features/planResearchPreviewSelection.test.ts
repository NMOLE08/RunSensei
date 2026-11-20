import { selectResearchPreview, type HalfPreviewSnapshot } from '@/features/execution/planResearchPreviewSelection';
import type { CurrentExperimentalHalfMarathonPreview } from '@/application/experimentalHalfMarathonPreview';

const identity = 'owner-a:half_marathon:fingerprint:2026-11-20';
const unavailable = (codes: string[]): CurrentExperimentalHalfMarathonPreview => ({ kind: 'unavailable', reasonCodes: codes, researchOnly: true, productionEligible: false });
const state = (changes: Partial<HalfPreviewSnapshot> = {}): HalfPreviewSnapshot => ({ status: 'ready', data: unavailable(['assessment_outdated']), error: null, identity, ...changes });

describe('Plan research preview selection', () => {
  it('keeps a half-marathon null result in a safe loading state', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state({ status: 'loading', data: null, identity: null }))).toEqual({ kind: 'loading' });
  });

  it('keeps a failed half-marathon read out of the preview card', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state({ status: 'unavailable', data: null, error: 'offline' }))).toEqual({ kind: 'error', message: 'offline' });
  });

  it('renders applicable unavailable half-marathon results for their targeted explanation', () => {
    expect(selectResearchPreview(true, 'half_marathon', identity, state())).toMatchObject({ kind: 'preview', value: { kind: 'unavailable', reasonCodes: ['assessment_outdated'] } });
  });

  it('does not render a retained candidate after a goal, account, or fingerprint identity change', () => {
    for (const current of ['owner-a:10k:fingerprint:2026-11-20', 'owner-b:half_marathon:fingerprint:2026-11-20', 'owner-a:half_marathon:new-fingerprint:2026-11-20']) {
      expect(selectResearchPreview(true, 'half_marathon', current, state())).toEqual({ kind: 'none' });
    }
  });

  it('does not show a non-applicable half-marathon result for 10K', () => {
    expect(selectResearchPreview(true, '10k', identity, state({ data: unavailable(['goal_not_half_marathon']) }))).toEqual({ kind: 'none' });
  });

  it('retains a matching foundation blocker and rejects an irrelevant half-marathon blocker', () => {
    expect(selectResearchPreview(true, '10k', identity, state({ data: unavailable(['foundation_frequency_required']) }))).toMatchObject({ kind: 'preview' });
    expect(selectResearchPreview(true, '10k', identity, state({ data: unavailable(['goal_not_half_marathon']) }))).toEqual({ kind: 'none' });
  });

  it('hides research content entirely when the build gate is off', () => {
    expect(selectResearchPreview(false, 'half_marathon', identity, state())).toEqual({ kind: 'none' });
  });
});
