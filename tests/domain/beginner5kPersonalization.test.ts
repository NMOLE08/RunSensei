import { buildFirst5kPersonalizationInput } from '@/application/systemAPlanningInput';
import { emptyFitnessAssessmentDraft, normalizeFitnessAssessmentDraft } from '@/domain/assessment/types';
import { beginner5kContinuousCandidatePersonalizationPolicy, bundledBeginner5kPersonalizationPolicies, first5kFixedBaselinePersonalizationPolicy, validateBeginner5kPersonalizationPolicy } from '@/domain/planning/beginner5kPersonalizationPolicy';
import { Beginner5kPersonalizationRegistry } from '@/domain/planning/beginner5kPersonalizationRegistry';
import { selectBeginner5kPathway, type Beginner5kPersonalizationInput } from '@/domain/planning/selectBeginner5kPathway';

const registry = new Beginner5kPersonalizationRegistry(bundledBeginner5kPersonalizationPolicies);
const reference = { policyId: first5kFixedBaselinePersonalizationPolicy.policyId, version: first5kFixedBaselinePersonalizationPolicy.version };
const input = (change: Partial<Beginner5kPersonalizationInput> = {}): Beginner5kPersonalizationInput => ({
  adultAgeConfirmed: true, canWalk30MinutesComfortably: true, experience: 'none_or_limited', healthConcern: false, interruption: 'none',
  goal: 'first_5k_completion', goalFocus: 'completion', planStartDate: '2026-11-02', availableDays: [1, 3, 6], continuousRunMinutes: null, weeklyRunningMinutes: null, weeklyDistance: null, longestRecentSessionMinutes: null, weekdayMinuteLimits: { 1: 60, 3: 60, 6: 60 }, ...change,
});

describe('beginner 5K personalization infrastructure', () => {
  it('does not claim first-time workload compatibility without a reviewed starting-workload rule', () => {
    const result = selectBeginner5kPathway(registry, reference, input());
    expect(result).toMatchObject({ kind: 'policy_gap', productionEligible: false });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['starting_workload_compatibility_rule_missing', 'missing_recent_weekly_training_evidence', 'missing_longest_recent_session_evidence']));
  });

  it('keeps missing eligibility evidence, health holds, experience differences, and scheduling failures explicit', () => {
    expect(selectBeginner5kPathway(registry, reference, input({ adultAgeConfirmed: null })).kind).toBe('insufficient_information');
    expect(selectBeginner5kPathway(registry, reference, input({ canWalk30MinutesComfortably: null })).kind).toBe('insufficient_information');
    expect(selectBeginner5kPathway(registry, reference, input({ healthConcern: true }))).toMatchObject({ kind: 'health_hold', productionEligible: false });
    expect(selectBeginner5kPathway(registry, reference, input({ experience: 'substantial' }))).toMatchObject({ kind: 'policy_gap', reasonCodes: ['no_explicit_pathway_for_experience'] });
    expect(selectBeginner5kPathway(registry, reference, input({ availableDays: [1, 2, 4] })).kind).toBe('scheduling_incompatible');
    expect(selectBeginner5kPathway(registry, reference, input({ availableDays: [0, 2, 4] })).kind).toBe('policy_gap');
    expect(selectBeginner5kPathway(registry, reference, input({ interruption: 'one_to_four_weeks' }))).toMatchObject({ kind: 'policy_gap', reasonCodes: ['returning_runner_pathway_requires_review'] });
    expect(selectBeginner5kPathway(registry, reference, input({ planStartDate: '2026-02-30' }))).toMatchObject({ kind: 'insufficient_information', reasonCodes: ['invalid_plan_start_date'] });
  });

  it('rejects unavailable policy versions and conflicting policy-pack references', () => {
    expect(selectBeginner5kPathway(registry, { ...reference, version: '99.0.0' }, input())).toMatchObject({ kind: 'policy_gap', reasonCodes: ['personalization_policy_version_unavailable'] });
    const incompatible = {
      ...first5kFixedBaselinePersonalizationPolicy,
      policyId: 'test.incompatible',
      pathways: [{ ...first5kFixedBaselinePersonalizationPolicy.pathways[0], workoutPolicyPack: { ...first5kFixedBaselinePersonalizationPolicy.pathways[0].workoutPolicyPack, policyReferences: [] } }],
    };
    const incompatibleRegistry = new Beginner5kPersonalizationRegistry([incompatible]);
    expect(selectBeginner5kPathway(incompatibleRegistry, { policyId: incompatible.policyId, version: incompatible.version }, input())).toMatchObject({ kind: 'policy_gap', reasonCodes: ['pathway_reference_mismatch'] });
  });

  it('never authorizes the draft pathway for production activation and preserves exact historical references', () => {
    const pathway = first5kFixedBaselinePersonalizationPolicy.pathways[0];
    expect(registry.authorizeActivation(reference, pathway.id, pathway.version)).toMatchObject({ kind: 'unavailable', code: 'policy_not_authorized' });
    expect(registry.resolvePolicy(reference)).toMatchObject({ kind: 'found', policy: { version: '0.2.0-draft' } });
    expect(registry.resolvePolicy({ ...reference, version: '0.1.0-draft' })).toMatchObject({ kind: 'unavailable', code: 'personalization_policy_version_unavailable' });
  });

  it('does not select a pathway whose starting-workload rule is not explicitly supported', () => {
    const policyWithGap = {
      ...first5kFixedBaselinePersonalizationPolicy,
      policyId: 'test.starting-workload-gap',
      startingWorkloadRules: [{ id: 'fixed_pack_start_v1', status: 'requires_review' as const, description: 'Not approved.' }],
    };
    const gapRegistry = new Beginner5kPersonalizationRegistry([policyWithGap]);
    expect(selectBeginner5kPathway(gapRegistry, { policyId: policyWithGap.policyId, version: policyWithGap.version }, input())).toMatchObject({ kind: 'policy_gap', reasonCodes: ['starting_workload_rule_not_supported'] });
  });

  it('validates the source-controlled personalization policy and rejects an incomplete policy', () => {
    expect(validateBeginner5kPersonalizationPolicy(first5kFixedBaselinePersonalizationPolicy)).toEqual([]);
    expect(validateBeginner5kPersonalizationPolicy(beginner5kContinuousCandidatePersonalizationPolicy)).toEqual([]);
    expect(validateBeginner5kPersonalizationPolicy({ ...first5kFixedBaselinePersonalizationPolicy, evidence: [] })).toContain('missing_evidence');
  });

  it('selects a different draft-only continuous-running programme only with candidate evidence', () => {
    const reference = { policyId: beginner5kContinuousCandidatePersonalizationPolicy.policyId, version: beginner5kContinuousCandidatePersonalizationPolicy.version };
    const selected = selectBeginner5kPathway(registry, reference, input({ experience: 'substantial', continuousRunMinutes: 20, weeklyRunningMinutes: 80, longestRecentSessionMinutes: 30 }));
    expect(selected).toMatchObject({ kind: 'policy_gap', productionEligible: false });
    expect(selected.reasonCodes).toContain('starting_workload_compatibility_rule_missing');
    expect(selectBeginner5kPathway(registry, reference, input({ experience: 'substantial', continuousRunMinutes: null }))).toMatchObject({ kind: 'insufficient_information', reasonCodes: ['missing_continuous_running_evidence'] });
    const pathway = beginner5kContinuousCandidatePersonalizationPolicy.pathways.find((item) => item.id === 'continuous_running_beginner_fixed_12_week');
    if (!pathway) throw new Error('Continuous pathway missing');
    expect(registry.authorizeActivation(reference, pathway.id, pathway.version)).toMatchObject({ kind: 'unavailable', code: 'policy_not_authorized' });
  });

  it('upgrades old JSON draft fields without using save timestamps as plan-start dates', () => {
    const legacy = { ...emptyFitnessAssessmentDraft('runner-1', 'UTC'), schemaVersion: 1 as const };
    const oldPayload = { ...legacy } as Record<string, unknown>;
    delete oldPayload.adultAgeConfirmed; delete oldPayload.canWalk30MinutesComfortably; delete oldPayload.first5kExperience;
    const restored = normalizeFitnessAssessmentDraft(oldPayload as unknown as typeof legacy);
    expect(restored).toMatchObject({ schemaVersion: 8, adultAgeConfirmed: null, canWalk30MinutesComfortably: null, first5kExperience: 'unknown', planStartDate: '', minuteLimitConfirmedDays: [], weeklyEvidenceConfirmedAt: '', currentCapabilityConfirmedAt: '', foundationFrequency: null, foundationPostBreakConfirmed: false, currentTrainingStatus: 'unknown', lastRunningDate: '', interruptionReason: 'unknown', coachId: null, coachIntroAcknowledged: false, observedWeeklyRunFrequency: 'unknown', runningConsistency: 'unknown', runningStyle: 'unknown', easyRunTalkTest: 'not_sure_or_not_applicable', usualComfortableRunEffort: 'not_sure_or_not_applicable', trainingObjective: 'finish', preferredTrainingFrequency: 'unknown', longestSessionDistance: '', longestSessionDistanceUnit: 'km' });
    expect(buildFirst5kPersonalizationInput({ ...restored, adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' }).planStartDate).toBeNull();
    expect(buildFirst5kPersonalizationInput({ ...restored, planStartDate: '2026-11-02', adultAgeConfirmed: true, canWalk30MinutesComfortably: true, first5kExperience: 'none_or_limited' }).planStartDate).toBe('2026-11-02');
  });

  it('normalizes a legacy serialized foundation frequency without deriving it from availability', () => {
    const raw = { ...emptyFitnessAssessmentDraft('runner-1', 'UTC'), trainingDays: [0, 1, 3, 6], foundationFrequency: '3' };
    expect(normalizeFitnessAssessmentDraft(raw as unknown as typeof raw).foundationFrequency).toBe(3);
  });
});
