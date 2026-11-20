import { mentorIds, mentorPersonaFor, mentorPersonas } from '@/domain/mentorPersonas';

describe('mentor personas', () => {
  it('defines exactly Moss and Jett with the approved role titles', () => {
    expect(mentorIds).toEqual(['moss', 'jett']);
    expect(Object.keys(mentorPersonas).sort()).toEqual(['jett', 'moss']);
    expect(mentorPersonaFor('moss').roleTitle).toBe('The Hard-to-Impress Mentor');
    expect(mentorPersonaFor('jett').roleTitle).toBe('The Roasting Mentor');
  });

  it('requires the same respectful fallback for sensitive situations', () => {
    expect(mentorPersonaFor('moss').sensitiveContextFallback).toBe(mentorPersonaFor('jett').sensitiveContextFallback);
    expect(mentorPersonaFor('jett').toneConstraints).toContain('never shaming');
  });
});
