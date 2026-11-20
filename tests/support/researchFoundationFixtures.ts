import { generateFoundationProgram, type FoundationProgramEvidence } from '@/domain/planning/foundationProgram';
import { snapshotResearchBlock, type ResearchBlock, type ResearchOutcome } from '@/domain/planning/researchFoundation';
import type { MultiDistanceRunnerConstraints } from '@/domain/planning/multiDistancePolicy';
import { plannedComponents } from '@/domain/performance/workoutCompletion';

export const researchEvidence: FoundationProgramEvidence = { context: 'currently_training', currentWeeklyRunningSeconds: 3000, currentContinuousRunningSeconds: 2700, currentEvidenceConfirmed: true, comfortableWalkingConfirmed: true, demonstratedAfterBreak: true, healthConcern: false, healthRelatedInterruption: false, requestedFrequency: 3 };
export const researchConstraints: MultiDistanceRunnerConstraints = { ownerId: 'account-a', goalFamily: 'half_marathon', startDate: '2027-01-04', fixedGoalDate: null, availableDays: [1,3,6].map(weekday => ({ weekday, maxMinutes: 45, confirmedByRunner: true })), unavailableDates: [], preferredLongRunDay: null };
export function researchBlock(evidence = researchEvidence, constraints = researchConstraints, id = 'research-block'): ResearchBlock {
  const program = generateFoundationProgram(evidence, constraints); if (program.kind !== 'foundation_program') throw new Error(program.reasonCodes.join(','));
  return snapshotResearchBlock({ id, ownerId: constraints.ownerId, evidenceReference: JSON.stringify(evidence), evidence, constraints, program, parentBlockId: null, createdAt: '2027-01-04T00:00:00Z' });
}
export function successfulOutcomes(block: ResearchBlock): ResearchOutcome[] {
  return block.assignments.map((a,i) => ({ id: `outcome-${i}`, blockId: block.id, assignmentId: a.assignmentId, previousVersionId: null, removed: false, associatedActivityId: null, recordedAt: `${a.plannedDate}T18:00:00Z`, record: {
    activityLogId: null, previousVersionId: null, workoutId: a.logicalSessionId, planId: a.planId, revisionId: a.revisionId, policyReferences: a.policyReferences, pathwayReference: a.pathwayReference,
    status: 'completed', actualDate: a.plannedDate, completedAt: `${a.plannedDate}T18:00:00Z`, actualDurationSeconds: a.durationSeconds, actualRunningSeconds: plannedComponents(a).runningSeconds, actualDistanceMeters: null,
    rpe: 3, difficulty: 'comfortable', fatigue: 'none', discomfort: 'none', reason: null, note: null, source: 'manual', durationReliability: 'medium', distanceReliability: 'unknown', observedWindow: { start: a.plannedDate, end: a.plannedDate },
  } }));
}
export const nextResearchInput = { evidence: researchEvidence, constraints: { ...researchConstraints, startDate: '2027-02-01' as const }, confirmedAt: '2027-02-01', asOfDate: '2027-02-01', interruption: false };
