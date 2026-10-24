import type { PlanTemplate, RuleConfig } from './content';

/** Synthetic UI/test fixture only. It is not reviewed training content or training advice. */
const demoProvenance = { author: 'AiSensei development fixture', reviewer: null, reviewDate: null, rightsSourceNotes: 'Synthetic test-only values; no production training rights.', reviewState: 'draft' as const, demoOnly: true };
export const demoHalfTemplate: PlanTemplate = {
  ...demoProvenance, id: 'demo:half-marathon-completion', semanticVersion: '0.1.0-demo', engineCompatibility: '1', supportedGoal: 'half_marathon_completion', trainingFrequencyPerWeek: 3, authoredDurationWeeks: 16, allowedWeeklyPatterns: [[1, 3, 6], [0, 2, 5]], entryRequirementReference: 'demo-only-entry-confirmation', ruleConfigId: 'demo:half-rules',
  phases: [
    { name: 'foundation', weeks: 4, sessions: phaseSessions(1200, 1200, 1800) },
    { name: 'endurance_development', weeks: 4, sessions: phaseSessions(1200, 1500, 2100) },
    { name: 'race_preparation', weeks: 5, sessions: phaseSessions(1500, 1500, 2400) },
    { name: 'taper', weeks: 3, sessions: phaseSessions(1200, 1200, 1800) },
  ],
};
export const demo5kTemplate: PlanTemplate = { ...demoHalfTemplate, id: 'demo:5k-completion', supportedGoal: '5k_completion', authoredDurationWeeks: 5, phases: [{ name: 'foundation', weeks: 2, sessions: phaseSessions(900, 900, 1200) }, { name: 'taper', weeks: 3, sessions: phaseSessions(900, 900, 1200) }] };
export const demo10kTemplate: PlanTemplate = { ...demoHalfTemplate, id: 'demo:10k-completion', supportedGoal: '10k_completion', authoredDurationWeeks: 7, phases: [{ name: 'foundation', weeks: 2, sessions: phaseSessions(900, 1200, 1500) }, { name: 'endurance_development', weeks: 2, sessions: phaseSessions(1200, 1200, 1800) }, { name: 'taper', weeks: 3, sessions: phaseSessions(900, 900, 1200) }] };
export const demoHalfRules: RuleConfig = { ...demoProvenance, id: 'demo:half-rules', semanticVersion: '0.1.0-demo', engineCompatibility: '1', maxWeeklyDurationSeconds: 7200, maxLongRunIncreaseSeconds: 600, minRecoveryDaysBetweenRuns: 1, protectedTaperWeeks: 3 };

function phaseSessions(easy: number, quality: number, long: number) { return [{ role: 'easy' as const, durationSeconds: easy, purpose: 'Demo easy session', effortCue: 'Demo easy cue', priority: 'standard' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: easy }], approvedAlternatives: ['None authored for demo content'] }, { role: 'quality' as const, durationSeconds: quality, purpose: 'Demo quality session', effortCue: 'Demo controlled cue', priority: 'standard' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: quality }], approvedAlternatives: ['None authored for demo content'] }, { role: 'long' as const, durationSeconds: long, purpose: 'Demo long session', effortCue: 'Demo comfortable cue', priority: 'protected' as const, steps: [{ label: 'Run', instruction: 'Synthetic demo instruction only.', durationSeconds: long }], approvedAlternatives: ['None authored for demo content'] }]; }
