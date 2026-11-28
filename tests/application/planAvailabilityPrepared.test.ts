import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireActiveAccountId } from '@/application/localAccount';
import { canPublishPreparedBeginner5k, openPlanAvailability } from '@/application/planAvailability';
import { resolvePreparedPlanCandidate } from '@/application/preparedPlanCandidate';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { migrate } from '@/data/migrations';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { MemoryDatabase } from '../support/memoryDatabase';
import { preparedDraft, type PreparedGoal } from '../support/preparedPlanFixtures';

jest.mock('@/application/localAccount', () => ({ requireActiveAccountId: jest.fn() }));
jest.mock('@/application/preparedPlanCandidate', () => ({ resolvePreparedPlanCandidate: jest.fn() }));
jest.mock('@/data/expoSqliteDatabase', () => ({ openAppDatabase: jest.fn() }));
jest.mock('@/services/account/onboardingProgress', () => ({ loadRemoteOnboardingAnswers: jest.fn(async () => null) }));

let database: MemoryDatabase;
let activeAccount: string;

beforeEach(async () => {
  jest.clearAllMocks();
  database = new MemoryDatabase();
  await migrate(database, '2027-01-01T00:00:00.000Z');
  (openAppDatabase as jest.Mock).mockResolvedValue(database);
  activeAccount = 'account-a';
  jest.mocked(requireActiveAccountId).mockImplementation(async () => activeAccount);
  jest.mocked(resolvePreparedPlanCandidate).mockResolvedValue({ kind: 'not_applicable' });
});

async function saveDraft(goal: PreparedGoal) {
  const draft = preparedDraft(goal, 'account-a');
  await new FitnessAssessmentRepository(database, 'account-a').saveDraft(draft);
  return draft;
}

function candidateResult(goal: PreparedGoal) {
  const payload = goal === 'half_marathon'
    ? { kind: 'half_marathon', simulation: {} }
    : { kind: 'event_distance', candidate: { kind: 'plan', goalFamily: goal } };
  return {
    kind: 'candidate',
    value: {
      candidate: {},
      payload,
      staleAgainstCurrentProfile: { changed: false, generatedEvidenceFingerprint: 'fp-a', currentEvidenceFingerprint: 'fp-a' },
      healthHold: { active: false, reasonCodes: [] },
    },
  } as never;
}

describe('openPlanAvailability ownership guard', () => {
  it.each<PreparedGoal>(['10k', 'half_marathon', 'marathon'])('never publishes a stale %s result after an account switch', async (goal) => {
    await saveDraft(goal);
    jest.mocked(resolvePreparedPlanCandidate).mockImplementation(async () => {
      activeAccount = 'account-b';
      return candidateResult(goal);
    });

    await expect(openPlanAvailability()).rejects.toThrow('Account changed while reading plan status.');
    expect(resolvePreparedPlanCandidate).toHaveBeenCalledTimes(1);
  });
});

describe('5K publication gate', () => {
  const candidateView = (healthHold: { active: boolean; reasonCodes: readonly string[] }, stale = false) => ({
    candidate: {},
    payload: { kind: 'experimental_5k', preview: {} },
    staleAgainstCurrentProfile: { changed: stale, generatedEvidenceFingerprint: 'fp-a', currentEvidenceFingerprint: 'fp-b' },
    healthHold,
  } as never);

  it('stays false for a health-blocked saved calendar even when the service authorizes it', () => {
    expect(canPublishPreparedBeginner5k({ canPublish: true }, candidateView({ active: true, reasonCodes: ['health_review_required'] }))).toBe(false);
  });

  it('still blocks a stale or missing preview without a health signal', () => {
    expect(canPublishPreparedBeginner5k({ canPublish: true }, candidateView({ active: false, reasonCodes: [] }, true))).toBe(false);
    expect(canPublishPreparedBeginner5k({ canPublish: true })).toBe(false);
    expect(canPublishPreparedBeginner5k({ canPublish: true }, candidateView({ active: false, reasonCodes: [] }))).toBe(true);
  });

  it('is the gate used by plan availability', () => {
    const source = readFileSync(join(__dirname, '../../src/application/planAvailability.ts'), 'utf8');
    expect(source).toContain('const canPublish = canPublishPreparedBeginner5k(publication, preparedCandidate);');
  });
});
