import { presentMentor } from '@/features/coaches/mentorPresentation';

describe('mentor presentation', () => {
  it('keeps Moss and Jett distinct while stating the shared coaching boundary', () => {
    const moss = presentMentor('moss', 'selection');
    const jett = presentMentor('jett', 'selection');
    expect(moss.title).toBe('The Hard-to-Impress Mentor');
    expect(jett.title).toBe('The Roasting Mentor');
    expect(moss.description).not.toBe(jett.description);
    expect(moss.sharedCoachingNote).toBe('Different personalities. The same training decisions.');
    expect(jett.sharedCoachingNote).toBe(moss.sharedCoachingNote);
  });

  it('uses the same respectful copy in sensitive contexts', () => {
    expect(presentMentor('moss', 'sensitive').description).toBe(presentMentor('jett', 'sensitive').description);
  });

  it('uses a neutral fallback for unknown presentation contexts', () => {
    expect(presentMentor('jett', 'unknown').description).toContain('approved coaching decisions');
  });
});
