import { withDemoScheduleAssumptions } from '@/domain/onboarding/demoSchedule';
import { emptyDraft } from '@/domain/onboarding/types';
import { assessEligibility } from '@/domain/onboarding/eligibility';

it('uses clearly separate demo schedule assumptions without changing saved availability', () => {
  const draft = { ...emptyDraft('Asia/Kolkata'), weeklyRunningMinutes: '120', baselineLookbackDays: '28', longestSessionMinutes: '45', longestSessionDate: '2026-10-01', comfortableDurationMinutes: '30', recentInterruption: 'none' as const, entryRequirementStatus: 'meets' as const, goalMode: 'flexible' as const, startDate: '2026-11-01', trainingDays: [0, 2, 4], minuteLimits: { 0: '45', 2: '45', 4: '90' }, preferredLongRunDay: 4, unavailableDates: '2026-11-03' };
  const demo = withDemoScheduleAssumptions(draft);
  expect(demo.trainingDays).toEqual([1, 3, 6]);
  expect(draft.trainingDays).toEqual([0, 2, 4]);
  expect(draft.unavailableDates).toBe('2026-11-03');
  expect(assessEligibility(demo, '2026-10-26').code).toBe('eligible');
});
