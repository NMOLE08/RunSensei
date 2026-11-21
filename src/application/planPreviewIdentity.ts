import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import type { FitnessAssessmentDraft } from '@/domain/assessment/types';
import { runnerLocalDate } from '@/domain/planning/beginner5kRunnerEvidence';
import type { HalfMarathonPathwayIntent } from '@/domain/planning/halfMarathonPathwayIntent';

/**
 * The account-local inputs that make a research preview safe to display.
 * This deliberately uses the assessment identity because it already includes
 * goal, capacity, scheduling, and availability evidence.
 */
export type PlanPreviewIdentity = Readonly<{
  ownerId: string;
  goal: FitnessAssessmentDraft['goal'] | null;
  assessmentFingerprint: string | null;
  evaluationDate: string | null;
  pathwayChoice: HalfMarathonPathwayIntent['choice'] | null;
  pathwayRevision: number | null;
}>;

export function previewIdentityFor(ownerId: string, draft: FitnessAssessmentDraft | null, now = new Date().toISOString(), evaluationDate?: string | null, pathwayIntent?: HalfMarathonPathwayIntent | null): PlanPreviewIdentity {
  return {
    ownerId,
    goal: draft?.goal ?? null,
    assessmentFingerprint: draft ? assessmentEvidenceFingerprint(draft) : null,
    evaluationDate: draft ? evaluationDate ?? runnerLocalDate(now, draft.timezone) : null,
    pathwayChoice: pathwayIntent?.choice ?? null,
    pathwayRevision: pathwayIntent?.revision ?? null,
  };
}

export function samePlanPreviewIdentity(left: PlanPreviewIdentity, right: PlanPreviewIdentity): boolean {
  return left.ownerId === right.ownerId
    && left.goal === right.goal
    && left.assessmentFingerprint === right.assessmentFingerprint
    && left.evaluationDate === right.evaluationDate
    && left.pathwayChoice === right.pathwayChoice
    && left.pathwayRevision === right.pathwayRevision;
}

export function planPreviewIdentityKey(value: PlanPreviewIdentity): string {
  return `${value.ownerId}:${value.goal ?? 'none'}:${value.assessmentFingerprint ?? 'none'}:${value.evaluationDate ?? 'none'}:${value.pathwayChoice ?? 'legacy'}:${value.pathwayRevision ?? 'none'}`;
}
