import { Beginner5kPersonalizationRegistry } from '@/domain/planning/beginner5kPersonalizationRegistry';
import { bundledBeginner5kPersonalizationPolicies, type Beginner5kPathway, type ImmutablePolicyReference, type WorkoutPolicyPackReference } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { selectBeginner5kPathway, type Beginner5kPersonalizationInput } from '@/domain/planning/selectBeginner5kPathway';
import { evaluateBeginner5kCandidateCompatibility, type Beginner5kCandidateEvidence } from '@/domain/planning/evaluateBeginner5kCandidateCompatibility';
import { bundledDraft5kProgramRegistry } from '@/domain/planning/draft5kProgramRegistry';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { analyzeWorkoutPerformance, type WorkoutPerformanceAnalysis } from '@/domain/performance/analyzeWorkoutPerformance';
import { summarizeRecentTrend, summarizeWeek } from '@/domain/performance/summarizeWorkoutHistory';
import type { PlannedWorkoutSnapshot, WorkoutCompletionRecord } from '@/domain/performance/workoutCompletion';
import { evaluateBeginner5kAdaptation, type Beginner5kAdaptationInput } from '@/domain/adaptation/evaluateBeginner5kAdaptation';
import { previewBeginner5kAdaptation, type AdaptationPreview } from '@/domain/adaptation/previewBeginner5kAdaptation';
import { beginner5kAdaptationPrescriptionV02 } from '@/domain/adaptation/beginner5kAdaptationPrescriptionPolicy';
import { asResearchOnly, type ResearchOnly } from './researchOnly';

export type ResearchScenario = 'completed_week' | 'partial' | 'missed' | 'unreported' | 'one_difficult' | 'repeated_difficult' | 'fatigue' | 'pain' | 'corrected' | 'policy_mismatch' | 'scheduling_conflict' | 'event_preservation';
export type Beginner5kResearchFixture = { id: string; simulationDate: string; pathwayPolicyReference: ImmutablePolicyReference; pathwayId: string; pathwayVersion: string; strictInput: Beginner5kPersonalizationInput; candidateEvidence: Beginner5kCandidateEvidence; goalMode: 'fixed_date' | 'flexible'; goalDate: string | null; currentWeek: number; scenario: ResearchScenario };
export type Beginner5kResearchSimulation = ResearchOnly<{ fixtureId: string; strictGate: ReturnType<typeof selectBeginner5kPathway>; candidateCompatibility: ReturnType<typeof evaluateBeginner5kCandidateCompatibility>; pathway: { id: string; version: string }; workoutPolicyPack: WorkoutPolicyPackReference; calendar: { totalWeeks: 12; sessions: readonly First5kDraftSession[] }; systemC: { valid: boolean; violations: readonly string[]; policyReferences: readonly string[] }; completions: readonly WorkoutCompletionRecord[]; plannedSnapshots: readonly PlannedWorkoutSnapshot[]; analyses: readonly WorkoutPerformanceAnalysis[]; analysisIds: readonly string[]; weekly: ReturnType<typeof summarizeWeek>; recent: ReturnType<typeof summarizeRecentTrend>; adaptation: ReturnType<typeof evaluateBeginner5kAdaptation>; preview: AdaptationPreview; provenance: { originalAssignmentIds: readonly string[]; completionEvidenceIds: readonly string[]; policyReferences: readonly string[]; simulationDate: string } }>;

/** Pure A–E research harness. Strict production selection is observed, never overridden. */
export function runBeginner5kResearchSimulation(fixture: Beginner5kResearchFixture): Beginner5kResearchSimulation {
  const registry = new Beginner5kPersonalizationRegistry(bundledBeginner5kPersonalizationPolicies);
  const strictGate = selectBeginner5kPathway(registry, fixture.pathwayPolicyReference, fixture.strictInput);
  const path = registry.resolvePathway(fixture.pathwayPolicyReference, fixture.pathwayId, fixture.pathwayVersion);
  if (path.kind === 'unavailable') throw new Error(`Research fixture references unavailable pathway: ${path.code}`);
  const candidateCompatibility = evaluateBeginner5kCandidateCompatibility(path.pathway, fixture.candidateEvidence);
  const program = bundledDraft5kProgramRegistry.resolve(path.pathway.workoutPolicyPack);
  if (!program) throw new Error('Research fixture workout pack is unavailable.');
  const simulation = program.simulate(fixture.simulationDate, [...fixture.candidateEvidence.availableDays], false);
  if (simulation.kind === 'blocked') throw new Error(`Research fixture simulation blocked: ${simulation.reasons.join(',')}`);
  const safety = program.validate(simulation);
  const week = simulation.sessions.filter((session) => session.week === fixture.currentWeek);
  const planned = week.map((session, index) => toSnapshot(session, index, path.pathway, fixture.id));
  const completions = scenarioCompletions(fixture.scenario, planned, path.pathway.workoutPolicyPack.policyReferences);
  const analyses = completions.map((completion) => analyzeWorkoutPerformance(completion, planned.find((item) => item.logicalSessionId === completion.workoutId) ?? null));
  const weekly = summarizeWeek(`research-w${fixture.currentWeek}`, planned.map((item) => item.logicalSessionId), completions, analyses);
  const recent = summarizeRecentTrend(completions, analyses);
  const adaptationInput: Beginner5kAdaptationInput = { policyReference: { policyId: 'runsensei.5k.beginner.adaptation', version: '0.1.0-draft' }, planId: `research:${fixture.id}`, baseRevisionId: `research:${fixture.id}:revision-1`, pathwayReference: { id: path.pathway.id, version: path.pathway.version }, requiredPolicyReferences: path.pathway.workoutPolicyPack.policyReferences, analyses, weekly, recent, interruptionReported: false };
  const adaptation = evaluateBeginner5kAdaptation(adaptationInput);
  const preview = previewBeginner5kAdaptation({ decision: adaptation, prescriptionPolicyReference: { policyId: beginner5kAdaptationPrescriptionV02.policyId, version: beginner5kAdaptationPrescriptionV02.version }, workoutPolicyPack: path.pathway.workoutPolicyPack, baseSimulation: simulation, currentWeek: fixture.currentWeek, goalMode: fixture.goalMode, goalDate: fixture.goalDate, completedSourceWorkoutIds: planned.filter((item) => completions.some((completion) => completion.status === 'completed' && completion.workoutId === item.logicalSessionId)).map((item) => sourceWorkoutId(path.pathway.workoutPolicyPack, item)), weekdayMinuteLimits: fixture.candidateEvidence.weekdayMinuteLimits, unavailableDates: fixture.scenario === 'scheduling_conflict' ? [planned[0]!.plannedDate] : [] });
  const originalAssignmentIds = simulation.sessions.map((session) => `${path.pathway.workoutPolicyPack.policyId}@${path.pathway.workoutPolicyPack.version}:source-w${session.week}${session.code}`);
  return asResearchOnly({ researchOnly: true, productionEligible: false, fixtureId: fixture.id, strictGate, candidateCompatibility, pathway: { id: path.pathway.id, version: path.pathway.version }, workoutPolicyPack: path.pathway.workoutPolicyPack, calendar: { totalWeeks: 12, sessions: simulation.sessions }, systemC: { valid: safety.valid, violations: safety.violations.map((item) => item.code), policyReferences: safety.appliedPolicyReferences }, completions, plannedSnapshots: planned, analyses, analysisIds: analyses.map((analysis) => `analysis:${analysis.evidenceIds.join(':')}`), weekly, recent, adaptation, preview, provenance: { originalAssignmentIds, completionEvidenceIds: completions.map((item) => item.activityLogId).filter((id): id is string => id !== null), policyReferences: path.pathway.workoutPolicyPack.policyReferences, simulationDate: fixture.simulationDate } });
}

/** Developer-facing rendering of facts already produced by the pure harness. */
export function renderBeginner5kResearchReport(result: Beginner5kResearchSimulation): string {
  const preview = result.preview.kind === 'preview' ? `${result.preview.transformation}; ${result.preview.before.length} → ${result.preview.after.length} sessions; ${result.preview.validation.coachingReviewWarnings.join(', ') || 'no modified-progression warning'}` : `${result.preview.kind}: ${result.preview.reasonCodes.join(', ')}`;
  return [
    `# Research simulation: ${result.fixtureId}`,
    '',
    `- Research only: ${result.researchOnly}`,
    `- Production eligible: ${result.productionEligible}`,
    `- Simulation date: ${result.provenance.simulationDate}`,
    `- Pathway: ${result.pathway.id}@${result.pathway.version}`,
    `- Strict user-facing gate: ${result.strictGate.kind} (${result.strictGate.reasonCodes.join(', ')})`,
    `- Research candidate compatibility: ${result.candidateCompatibility.outcome} (${result.candidateCompatibility.reasonCodes.join(', ')})`,
    `- System C structural validation: ${result.systemC.valid}`,
    `- System D week: completed ${result.weekly.completed}, partial ${result.weekly.partial}, missed ${result.weekly.missed}, unreported ${result.weekly.unreported}`,
    `- System E: ${result.adaptation.decision} (${result.adaptation.reasonCodes.join(', ')})`,
    `- Preview: ${preview}`,
    `- Policy references: ${result.provenance.policyReferences.join(', ')}`,
    '',
    'This report is a deterministic offline research simulation. It is not approved coaching and does not create or modify a plan.',
  ].join('\n');
}

function toSnapshot(session: { week: number; code: 'A' | 'B' | 'C'; date: string; phase: string; durationSeconds: number | null; distanceMeters: number | null; steps: readonly { kind: 'warmup' | 'run' | 'walk' | 'cooldown' | 'event'; seconds: number | null; repeats: number }[] }, index: number, pathway: Beginner5kPathway, fixtureId: string): PlannedWorkoutSnapshot { return { assignmentId: `research:${fixtureId}:assignment:w${session.week}${session.code}`, logicalSessionId: `research:${fixtureId}:w${session.week}${session.code}`, planId: `research:${fixtureId}`, revisionId: `research:${fixtureId}:revision-1`, plannedDate: session.date, policyReferences: pathway.workoutPolicyPack.policyReferences, pathwayReference: { id: pathway.id, version: pathway.version }, structure: session.distanceMeters !== null ? 'distance_event' : session.steps.some((step) => step.kind === 'walk') ? 'run_walk' : 'continuous_run', durationSeconds: session.durationSeconds, distanceMeters: session.distanceMeters, steps: session.steps.map((step) => ({ kind: step.kind, seconds: step.seconds, repeats: step.repeats })) }; }
function completion(snapshot: PlannedWorkoutSnapshot, index: number, status: WorkoutCompletionRecord['status'], refs: readonly string[], changes: Partial<WorkoutCompletionRecord> = {}): WorkoutCompletionRecord { return { activityLogId: `research:activity:${snapshot.logicalSessionId}:${index}`, previousVersionId: null, workoutId: snapshot.logicalSessionId, planId: snapshot.planId, revisionId: snapshot.revisionId, policyReferences: refs, pathwayReference: snapshot.pathwayReference, status, actualDate: snapshot.plannedDate, completedAt: `${snapshot.plannedDate}T10:00:00.000Z`, actualDurationSeconds: status === 'missed' ? null : snapshot.durationSeconds, actualRunningSeconds: null, actualDistanceMeters: null, rpe: null, difficulty: 'comfortable', fatigue: 'none', discomfort: 'none', reason: null, note: null, source: 'timer_only', durationReliability: status === 'missed' ? 'unknown' : 'high', distanceReliability: 'unknown', observedWindow: { start: null, end: null }, ...changes }; }
function scenarioCompletions(scenario: ResearchScenario, planned: readonly PlannedWorkoutSnapshot[], refs: readonly string[]): WorkoutCompletionRecord[] {
  const all = () => planned.map((item, index) => completion(item, index, 'completed', refs));
  if (scenario === 'unreported') return all().slice(0, 2);
  if (scenario === 'partial') return all().map((item, index) => index === 0 ? { ...item, status: 'partial' as const, actualDurationSeconds: Math.max(1, (item.actualDurationSeconds ?? 1) - 60) } : item);
  if (scenario === 'missed') return all().map((item, index) => index === 0 ? { ...item, status: 'missed' as const, actualDurationSeconds: null } : item);
  if (scenario === 'one_difficult') return all().map((item, index) => index === 0 ? { ...item, difficulty: 'too_difficult' as const } : item);
  if (scenario === 'repeated_difficult') return all().map((item, index) => index < 2 ? { ...item, difficulty: 'too_difficult' as const } : item);
  if (scenario === 'fatigue') return all().map((item, index) => index === 0 ? { ...item, fatigue: 'unusual' as const } : item);
  if (scenario === 'pain') return all().map((item, index) => index === 0 ? { ...item, discomfort: 'pain_or_injury_concern' as const } : item);
  if (scenario === 'corrected') { const original = completion(planned[0]!, 0, 'completed', refs, { actualDurationSeconds: Math.max(1, (planned[0]!.durationSeconds ?? 1) - 60) }); const corrected = { ...completion(planned[0]!, 99, 'completed', refs), previousVersionId: original.activityLogId, actualDurationSeconds: planned[0]!.durationSeconds }; return [original, corrected, ...planned.slice(1).map((item, index) => completion(item, index + 1, 'completed', refs))]; }
  if (scenario === 'policy_mismatch') return all().map((item, index) => index === 0 ? { ...item, policyReferences: ['mismatched@1'] } : item);
  return all();
}
function sourceWorkoutId(pack: WorkoutPolicyPackReference, snapshot: PlannedWorkoutSnapshot) { const code = snapshot.logicalSessionId.slice(-1); const week = snapshot.logicalSessionId.match(/:w(\d+)/)?.[1]; return `${pack.policyId}@${pack.version}:w${week}${code}`; }
