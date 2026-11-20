import type { ReactElement, ReactNode } from 'react';
import * as flags from '@/config/experimental5kPreview';
import { useAuth } from '@/features/auth/AuthProvider';
import ResearchFoundationScreen from '@/app/research-foundation';
import { FoundationProgramPreview } from '@/features/execution/FoundationProgramPreview';
import { loadResearchFoundationHistory } from '@/application/researchFoundation';
import { researchBlock } from '../support/researchFoundationFixtures';

jest.mock('react', () => ({ ...jest.requireActual('react'), useState: (initial: unknown) => [initial, jest.fn()] }));
jest.mock('@/config/experimental5kPreview', () => ({ __esModule: true, experimental5kPreviewEnabled: true }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({})), useFocusEffect: jest.fn() }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('@/application/researchFoundation', () => ({ loadResearchFoundationHistory: jest.fn() }));
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}
afterEach(()=>jest.restoreAllMocks());
test('direct research route denies production and signed-out access without loading records',()=>{
  jest.mocked(useAuth).mockReturnValue({user:{id:'account-a'}} as never);
  jest.replaceProperty(flags,'experimental5kPreviewEnabled',false);
  expect(text(ResearchFoundationScreen())).toContain('unavailable');
  expect(loadResearchFoundationHistory).not.toHaveBeenCalled();
  jest.replaceProperty(flags,'experimental5kPreviewEnabled',true);
  jest.mocked(useAuth).mockReturnValue({user:null} as never);
  expect(text(ResearchFoundationScreen())).toContain('unavailable');
});
test('saved research route keys its private state by authenticated owner',()=>{
  jest.mocked(useAuth).mockReturnValue({user:{id:'account-a'}} as never);const a=ResearchFoundationScreen();
  jest.mocked(useAuth).mockReturnValue({user:{id:'account-b'}} as never);const b=ResearchFoundationScreen();
  expect(a.key).toBe('account-a');expect(b.key).toBe('account-b');
});
test('generated foundation adapter presents exact running/walking totals and draft restrictions',()=>{
  const program=researchBlock().program;const rendered=FoundationProgramPreview({value:program,onRegenerate:jest.fn()});const labels=text(rendered).replace(/\s+/g,' ');
  expect(labels).toContain('50 min running · 30 min walking');expect(labels).toContain('80 min total time');
  expect(labels).toContain('WARMUP');expect(labels).toContain('COOLDOWN');expect(labels).toContain('Run at a comfortable conversational effort');
  expect(labels).toContain('Half marathon');expect(labels).toContain('Plan preview — not active yet.');
});
