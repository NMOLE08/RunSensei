import type { CoachId } from '@/domain/coachSelection';
import { mentorPersonaFor } from '@/domain/mentorPersonas';

export type MentorPresentationContext = 'selection' | 'introduction' | 'sensitive' | 'unknown';
export type MentorPresentation = Readonly<{ title: string; description: string; sharedCoachingNote: string }>;

const sharedCoachingNote = 'Different personalities. The same training decisions.';

/** Pure presentation copy. It does not inspect or change training decisions. */
export function presentMentor(coachId: CoachId, context: MentorPresentationContext = 'selection'): MentorPresentation {
  const persona = mentorPersonaFor(coachId);
  if (context === 'sensitive') return { title: persona.displayName, description: persona.sensitiveContextFallback, sharedCoachingNote };
  if (context === 'introduction') return { title: persona.roleTitle, description: persona.introductionDescription, sharedCoachingNote };
  if (context === 'selection') return { title: persona.roleTitle, description: `${persona.introductionDescription} ${persona.recognitionStyle}`, sharedCoachingNote };
  return { title: persona.displayName, description: 'Your mentor’s presentation can differ, while approved coaching decisions stay the same.', sharedCoachingNote };
}
