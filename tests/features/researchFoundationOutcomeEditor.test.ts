import { createElement, type ReactElement, type ReactNode } from 'react';
import { Button, Disclosure } from '@/design/components';
import { ResearchWorkoutOutcomeRow } from '@/features/execution/ResearchFoundationProgress';
import { describeResearchBlock } from '@/domain/planning/researchFoundation';
import { researchBlock, successfulOutcomes } from '../support/researchFoundationFixtures';

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}

test('Record / correct outcome targets the selected saved assignment', () => {
  const block = researchBlock();
  const fact = { ...describeResearchBlock(block, [])[0]!, assignment: { ...describeResearchBlock(block, [])[0]!.assignment, plannedDate: '2026-01-01' } };
  const workout = block.program.workouts[0]!;
  const onEdit = jest.fn();
  const onStart = jest.fn();
  const row = ResearchWorkoutOutcomeRow({ fact, workout, title: 'Week 1 · Workout A', editing: false, expanded: true, outcomes: [], onEdit, onStart, onSkip: jest.fn(), onExpandedChange: jest.fn() });
  const button = elements(row.props.children).find(element => element.type === Button && element.props.label === 'Log a previous workout');
  const start = elements(row.props.children).find(element => element.type === Button && element.props.label === 'Start workout');

  expect(button).toBeDefined();
  button!.props.onPress?.();
  expect(onEdit).toHaveBeenCalledWith(block.assignments[0]!.assignmentId);
  start!.props.onPress?.();
  expect(onStart).toHaveBeenCalledWith(block.assignments[0]!.assignmentId);
});

test('selected outcome editor is rendered inside the workout the user opened', () => {
  const block = researchBlock();
  const fact = describeResearchBlock(block, [])[0]!;
  const workout = block.program.workouts[0]!;
  const editor = createElement('test-editor', null, 'Record actual outcome', 'Save research outcome');
  const row = ResearchWorkoutOutcomeRow({ fact, workout, title: 'Week 1 · Workout A', editing: true, expanded: false, outcomes: [], onEdit: jest.fn(), onStart: jest.fn(), onSkip: jest.fn(), onExpandedChange: jest.fn(), editor });
  const disclosure = elements(row).find(element => element.type === Disclosure);
  const renderedText = text(row.props.children);

  expect(renderedText).toContain('Record actual outcome');
  expect(renderedText).toContain('Save research outcome');
  expect(disclosure?.props.expanded).toBe(true);
  expect(row.props.title).toBe('Week 1 · Workout A');
  expect(renderedText).toContain('Warm-up');
  expect(renderedText).toContain('Main running');
  expect(renderedText).toContain('Cooldown');
  expect(elements(row).some(element => element.type === Button && element.props.label === 'Start workout')).toBe(false);
  expect(renderedText).not.toContain('How difficult did it feel?');
});

test('an upcoming workout shows instructions and start action without showing the outcome questionnaire', () => {
  const block = researchBlock();
  const fact = describeResearchBlock(block, [])[0]!;
  const row = ResearchWorkoutOutcomeRow({ fact, workout: block.program.workouts[0]!, title: 'Week 1 · Workout A', editing: false, expanded: true, outcomes: [], onEdit: jest.fn(), onStart: jest.fn(), onSkip: jest.fn(), onExpandedChange: jest.fn() });
  const labels = elements(row.props.children).filter(element => element.type === Button).map(element => element.props.label);

  expect(labels).toContain('Start workout');
  expect(labels).not.toContain('Log a previous workout');
  expect(text(row.props.children)).not.toContain('How difficult did it feel?');
  expect(text(row.props.children)).not.toContain('RPE 1–10');
});

test('unreported and corrected outcomes keep current facts separate from immutable history', () => {
  const block = researchBlock();
  const workout = block.program.workouts[0]!;
  const original = successfulOutcomes(block)[0]!;
  const corrected = { ...original, id: 'corrected-outcome', previousVersionId: original.id, record: { ...original.record, status: 'partial' as const } };
  const correctedFact = describeResearchBlock(block, [original, corrected])[0]!;
  const correctedRow = ResearchWorkoutOutcomeRow({ fact: correctedFact, workout, title: 'Week 1 · Workout A', editing: false, expanded: true, outcomes: [original, corrected], onEdit: jest.fn(), onStart: jest.fn(), onSkip: jest.fn(), onExpandedChange: jest.fn() });
  const missingFact = describeResearchBlock(block, [])[0]!;
  const missingRow = ResearchWorkoutOutcomeRow({ fact: missingFact, workout, title: 'Week 1 · Workout A', editing: false, expanded: false, outcomes: [], onEdit: jest.fn(), onStart: jest.fn(), onSkip: jest.fn(), onExpandedChange: jest.fn() });

  expect(correctedFact.outcome?.id).toBe('corrected-outcome');
  expect(correctedRow.props.summary).toBe('partial');
  expect(text(correctedRow)).toContain(original.id);
  expect(text(correctedRow)).toContain('corrected-outcome');
  expect(missingRow.props.summary).toBe('UNREPORTED — No outcome recorded');
  expect(missingFact.outcome).toBeNull();
  expect(missingFact.status).toBe('unreported');
});
