import type { PlanTemplate, RuleConfig } from './content';

/** Synthetic UI/test fixture only. It is not reviewed training content or training advice. */
const demoProvenance = { author: 'AiSensei development fixture', reviewer: null, reviewDate: null, rightsSourceNotes: 'Synthetic test-only values; no production training rights.', reviewState: 'draft' as const, demoOnly: true };
export const demoHalfTemplate: PlanTemplate = {
  ...demoProvenance, id: 'demo:half-marathon-completion', semanticVersion: '0.2.0-demo', engineCompatibility: '1', supportedGoal: 'half_marathon_completion', intendedRunner: 'Synthetic development example only', sourceUrls: [], contentStatus: 'demo', frequencyVariantId: 'demo-3-day', trainingFrequencyPerWeek: 3, authoredDurationWeeks: 16, allowedWeeklyPatterns: [[1, 3, 6], [0, 2, 5]], entryRequirementReference: 'demo-only-entry-confirmation', baselineCompatibility: { requiredFields: ['recentWeeklyMinutes', 'recentLongestSessionMinutes', 'recentLongestSessionDate', 'comfortableDurationMinutes', 'interruptionStatus'], allowedInterruptionStatuses: ['none'] }, ruleConfigId: 'demo:half-rules',
  phases: [
    phase('foundation', 4, 1200, 1200, 1800),
    phase('endurance_development', 4, 1200, 1500, 2100),
    phase('race_preparation', 5, 1500, 1500, 2400),
    phase('taper', 3, 1200, 1200, 1800),
  ],
};
export const demo5kTemplate: PlanTemplate = { ...demoHalfTemplate, id: 'demo:5k-completion', supportedGoal: '5k_completion', authoredDurationWeeks: 5, phases: [phase('foundation', 2, 900, 900, 1200), phase('taper', 3, 900, 900, 1200)] };
export const demo10kTemplate: PlanTemplate = { ...demoHalfTemplate, id: 'demo:10k-completion', supportedGoal: '10k_completion', authoredDurationWeeks: 7, phases: [phase('foundation', 2, 900, 1200, 1500), phase('endurance_development', 2, 1200, 1200, 1800), phase('taper', 3, 900, 900, 1200)] };
export const demoHalfRules: RuleConfig = { ...demoProvenance, id: 'demo:half-rules', semanticVersion: '0.1.0-demo', engineCompatibility: '1', maxWeeklyDurationSeconds: 7200, maxLongRunIncreaseSeconds: 600, minRecoveryDaysBetweenRuns: 1, protectedTaperWeeks: 3 };

function phaseSessions(easy: number, quality: number, long: number) { return [{ role: 'easy' as const, durationSeconds: easy, purpose: 'Demo easy session', effortCue: 'Demo easy cue', priority: 'standard' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: easy }], approvedAlternatives: ['None authored for demo content'] }, { role: 'quality' as const, durationSeconds: quality, purpose: 'Demo quality session', effortCue: 'Demo controlled cue', priority: 'standard' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: quality }], approvedAlternatives: ['None authored for demo content'] }, { role: 'long' as const, durationSeconds: long, purpose: 'Demo long session', effortCue: 'Demo comfortable cue', priority: 'protected' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: long }], approvedAlternatives: ['None authored for demo content'] }]; }
function phase(name: 'foundation' | 'endurance_development' | 'race_preparation' | 'taper', weeks: number, easy: number, quality: number, long: number) { const sessions = phaseSessions(easy, quality, long); return { name, weeks, sessions, weeklySessions: Array.from({ length: weeks }, () => sessions.map((session) => ({ ...session, steps: session.steps.map((step) => ({ ...step })) }))) }; }
