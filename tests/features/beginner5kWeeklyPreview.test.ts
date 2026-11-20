import type { ReactElement, ReactNode } from 'react';
import { Beginner5kWeeklyPreview } from '@/features/execution/Beginner5kWeeklyPreview';
import { loadBeginner5kWeeklyPreview } from '@/application/beginner5kWeeklyPreview';
import { previewBeginner5kWeek, beginnerFoundationReference } from '@/domain/planning/beginner5kWeeklyDecision';
import { normalizeBeginner5kEvidence } from '@/domain/planning/beginner5kRunnerEvidence';
import { emptyFitnessAssessmentDraft } from '@/domain/assessment/types';
import { researchEvidence, researchConstraints } from '../support/researchFoundationFixtures';

let mockResult: Awaited<ReturnType<typeof loadBeginner5kWeeklyPreview>> | null = null;
let mockHook = 0;
jest.mock('react', () => ({ ...jest.requireActual('react'), useState: (initial: unknown) => [mockHook++ === 0 ? mockResult : initial, jest.fn()] }));
jest.mock('@/application/beginner5kWeeklyPreview', () => ({ loadBeginner5kWeeklyPreview: jest.fn(), saveBeginner5kWeeklyConfirmation: jest.fn(), saveBeginner5kTrainingEpisode: jest.fn() }));

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  const props = (node as ReactElement<{ children?: ReactNode; label?: string; title?: string; summary?: string }>).props;
  return [props.title, props.summary, props.label, text(props.children)].join(' ');
}
beforeEach(() => { mockHook = 0; mockResult = null; jest.clearAllMocks(); });

test('viewing the panel does not run a simulation or offer publication', () => {
  const labels = text(Beginner5kWeeklyPreview({ owner: 'account-a', blockId: 'saved-block' }));
  expect(labels).toContain('Read-only research'); expect(labels).toContain('Proposed next block start');
  expect(labels).toContain('Check weekly decision'); expect(labels).not.toContain('Publish');
  expect(loadBeginner5kWeeklyPreview).not.toHaveBeenCalled();
});

test('the selected week exposes real steps, separate totals and visible research restrictions', () => {
  const draft = { ...emptyFitnessAssessmentDraft('account-a', 'UTC'), foundationEvidenceConfirmedAt: '2027-01-04', interruption: 'none' as const };
  mockResult = previewBeginner5kWeek({ evidence: normalizeBeginner5kEvidence(draft, researchEvidence, { ...researchConstraints, goalFamily: '5k' }, '2027-01-04', null, []), block: null, outcomes: [], week: 1, policyReference: beginnerFoundationReference });
  const labels = text(Beginner5kWeeklyPreview({ owner: 'account-a' })).replace(/\s+/g, ' ');
  expect(labels).toContain('Running 50 min'); expect(labels).toContain('Walking 30 min'); expect(labels).toContain('Total 80 min');
  expect(labels).toContain('2027-01-05'); expect(labels).toContain('Run at a comfortable conversational effort');
  expect(labels).toContain('Production activation is blocked'); expect(labels).toContain('Future stages require reassessment');
  expect(labels).toContain('Starting Workload Comparison'); expect(labels).toContain('confirmed report');
  expect(labels).toContain('observed mean'); expect(labels).toContain('lower reference');
  expect(labels).toContain('Unavailable'); expect(labels).toContain('Missing history is not zero running');
  expect(labels).toContain('none selected'); expect(labels).toContain('S = confirmed current report');
  expect(labels).toContain('Training Evidence'); expect(labels).toContain('Complete'); expect(labels).toContain('No Running'); expect(labels).toContain('Partial'); expect(labels).toContain('Unknown'); expect(labels).toContain('Save week status');
  expect(labels).toContain('Current Training Episode'); expect(labels).toContain('Choose episode start'); expect(labels).toContain('Save episode boundary'); expect(labels).toContain('Boundary unknown');
  expect(labels).toContain('Policy Readiness'); expect(labels).toContain('Evidence sufficiency'); expect(labels).toContain('Calculation available; prescription not authorized'); expect(labels).toContain('Session compatibility');
  expect(mockResult.workouts).toHaveLength(3);
});
