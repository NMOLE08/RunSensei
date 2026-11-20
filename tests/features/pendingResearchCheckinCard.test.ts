import { type ReactElement, type ReactNode } from 'react';
import { Button } from '@/design/components';
import { PendingResearchCheckinCard } from '@/features/tracker/PendingResearchCheckinCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elements(element.props.children)];
}

test('restart recovery notice clearly offers the exact pending check-in', () => {
  const checkin = { activityId: 'tracking:track-1', blockId: 'block-a', assignmentId: 'assignment-a', plannedDate: '2027-01-06' };
  const card = PendingResearchCheckinCard({ checkin });
  const rendered = elements(card);
  expect(rendered.some(item => item.type === Button && item.props.label === 'Complete workout feedback')).toBe(true);
  const button = rendered.find(item => item.type === Button && item.props.label === 'Complete workout feedback');
  button?.props.onPress?.();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/research-foundation', params: { blockId: 'block-a', assignmentId: 'assignment-a', activityId: 'tracking:track-1', focus: 'feedback' } });
});

beforeEach(() => mockPush.mockClear());
