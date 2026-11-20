import { assessEligibility } from '@/domain/onboarding/eligibility';
import { emptyDraft } from '@/domain/onboarding/types';
import { flexibleDemoTemplates } from '@/domain/training/demoFlexibleContent';
import { demoHalfRules } from '@/domain/training/demoContent';
import { generatePlan, selectTemplate, validatePlanConstraints } from '@/domain/training/engine';
import { bundledTemplateCatalog } from '@/domain/training/templateCatalog';
import type { PlanningRequest } from '@/domain/training/content';

it('supports another demo schedule and rejects past dates or unknown interruption', () => {
 const draft = { ...emptyDraft('Asia/Kolkata'), weeklyRunningMinutes: '120', baselineLookbackDays: '28', longestSessionMinutes: '45', longestSessionDate: '2026-10-01', comfortableDurationMinutes: '30', recentInterruption: 'none' as const, entryRequirementStatus: 'meets' as const, goalMode: 'flexible' as const, startDate: '2026-11-01', trainingDays: [0, 2, 4], minuteLimits: { 0: '45', 2: '45', 4: '90' }, preferredLongRunDay: 4, assumptionsConfirmed: true };
 expect(assessEligibility(draft, '2026-10-26').code).toBe('eligible');
 expect(assessEligibility(draft, '2026-11-02').fields).toContain('startDate');
 expect(assessEligibility({ ...draft, recentInterruption: 'unknown' }).fields).toContain('interruption');
});
it('schedules within chosen days and retains old template versions', () => {
 const input: PlanningRequest = { profile: { entryRequirementsMet: true, recentWeeklyMinutes: 120, recentLongestSessionMinutes: 45, recentLongestSessionDate: '2026-10-01', comfortableDurationMinutes: 30, interruptionStatus: 'none' }, goal: { mode: 'flexible', startDate: '2026-11-02', raceDate: null, distanceMeters: 21097 }, availability: { weekdayMinuteLimits: { 0: 45, 2: 45, 4: 90 }, preferredLongRunDay: 4, unavailableDates: [] }, templateMode: 'demo' };
 const selected = selectTemplate(input, flexibleDemoTemplates, [demoHalfRules]);
 expect(selected?.template.semanticVersion).toBe('0.3.0-demo');
 const result = generatePlan(input, selected!.template, demoHalfRules);
 expect(result.kind).toBe('preview');
 if (result.kind === 'preview') { expect(result.preview.schedulePattern[2]).toBe(4); expect(validatePlanConstraints(result.preview.sessions, input.availability, demoHalfRules)).toEqual([]); }
 expect(bundledTemplateCatalog.resolve('demo:half-marathon-completion', '0.2.0-demo', demoHalfRules.semanticVersion).kind).toBe('found');
});
