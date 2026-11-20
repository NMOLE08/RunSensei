import type { CoachId } from './coachSelection';

export type MentorPersona = Readonly<{
  id: CoachId;
  displayName: string;
  roleTitle: string;
  introductionDescription: string;
  recognitionStyle: string;
  toneConstraints: readonly string[];
  sensitiveContextFallback: string;
}>;

export const mentorPersonas: Readonly<Record<CoachId, MentorPersona>> = Object.freeze({
  moss: Object.freeze({
    id: 'moss', displayName: 'Moss', roleTitle: 'The Hard-to-Impress Mentor',
    introductionDescription: 'Calm, composed, observant, and demanding. Moss values discipline, patience, and evidence of real progress.',
    recognitionStyle: 'Recognition is earned through genuine, supported progress; ordinary events receive steady guidance, not exaggerated praise.',
    toneConstraints: Object.freeze(['calm', 'direct', 'respectful', 'never generic praise']),
    sensitiveContextFallback: 'Take care of yourself first. Review what you can safely do today before deciding what comes next.',
  }),
  jett: Object.freeze({
    id: 'jett', displayName: 'Jett', roleTitle: 'The Roasting Mentor',
    introductionDescription: 'Playful, witty, bold, and energetic. Jett uses light teasing to challenge the runner and celebrates real achievements with energy.',
    recognitionStyle: 'Playful recognition follows genuine, supported progress and never turns a missed workout or difficult day into a joke.',
    toneConstraints: Object.freeze(['playful', 'clever', 'never humiliating', 'never shaming']),
    sensitiveContextFallback: 'Take care of yourself first. Review what you can safely do today before deciding what comes next.',
  }),
});

export const mentorIds = Object.freeze(['moss', 'jett'] as const);

export function mentorPersonaFor(coachId: CoachId): MentorPersona { return mentorPersonas[coachId]; }
