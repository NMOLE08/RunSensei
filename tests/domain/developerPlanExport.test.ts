import { exportDeveloperPlanAttemptWithAdapter } from '@/services/research/developerPlanExport';
import { generateDeveloperPlanAttempt, type DeveloperPlanRawInput } from '@/domain/research/developerPlanGeneration';

const input: DeveloperPlanRawInput = { requestedGoal: 'first_5k_completion', goalFocus: 'completion', targetDistance: '5k', adultAgeConfirmed: true, canWalk30MinutesComfortably: true, experience: 'none_or_limited', healthConcern: false, interruption: 'none', continuousRunMinutes: '', weeklyRunningMinutes: '', longestRecentSessionMinutes: '', historyAgeDays: '', longestSessionAgeDays: '', planStartDate: '2026-11-02', goalMode: 'flexible', goalDate: '', availableDays: [1, 3, 6], weekdayMinuteLimits: { 1: '120', 3: '120', 6: '120' }, preferredDays: [], preferredLongRunDay: null, targetPerformance: '', performanceDate: '', trainingPreference: 'comfortable' };
const attempt = generateDeveloperPlanAttempt(input, { testId: 'export-test', generatedAt: '2026-11-04T10:00:00.000Z' });

describe('developer-plan Android JSON export', () => {
  it('writes valid JSON and opens the native share sheet without exposing credentials', async () => {
    let written = '';
    const result = await exportDeveloperPlanAttemptWithAdapter(attempt, 'A', { writeJson: async (_filename, content) => { written = content; return 'file:///cache/a.json'; }, sharingAvailable: async () => true, openShareSheet: async () => undefined });
    expect(result).toMatchObject({ kind: 'share_sheet_opened', filename: 'runsensei-research-plan-A-export-test.json' });
    expect(JSON.parse(written)).toMatchObject({ researchOnly: true, productionEligible: false });
    expect(written).not.toContain('access_token');
  });

  it('retains a real local file result when native sharing is unavailable', async () => {
    const result = await exportDeveloperPlanAttemptWithAdapter(attempt, 'B', { writeJson: async () => 'file:///cache/b.json', sharingAvailable: async () => false, openShareSheet: async () => { throw new Error('must not open'); } });
    expect(result).toEqual({ kind: 'sharing_unavailable', uri: 'file:///cache/b.json', filename: 'runsensei-research-plan-B-export-test.json' });
  });

  it('reports write and share failures without changing the attempt', async () => {
    const result = await exportDeveloperPlanAttemptWithAdapter(attempt, 'C', { writeJson: async () => { throw new Error('no storage'); }, sharingAvailable: async () => true, openShareSheet: async () => undefined });
    expect(result).toEqual({ kind: 'failed', message: 'no storage' });
    expect(attempt).toMatchObject({ researchOnly: true, productionEligible: false });
  });
});
