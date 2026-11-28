import type { FitnessAssessmentDraft, FitnessAssessmentResult } from '@/domain/assessment/types';
import type { HalfMarathonPathwayIntent } from '@/domain/planning/halfMarathonPathwayIntent';
import type { PlanSnapshot } from '@/domain/training/entities';

/** Account-local facts shared by plan status and prepared-candidate resolution. */
export type CurrentAccountPlanFacts = {
  ownerId: string;
  draft: FitnessAssessmentDraft | null;
  assessment: FitnessAssessmentResult | null;
  activeSnapshot: PlanSnapshot | null;
  pathwayIntent: HalfMarathonPathwayIntent | null;
};
