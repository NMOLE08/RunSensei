import { schedulerCapabilities, stepTotals, validateStructuredTemplate, type Step, type StructuredPolicy, type StructuredTemplate } from '@/domain/training/structuredContent';
import { bundledTemplateCatalog } from '@/domain/training/templateCatalog';

const step = (unit: 'seconds' | 'meters', value: number): Step => ({ kind: 'work', instruction: 'Synthetic test', purpose: 'Fixture', effort: 'Fixture', target: { unit, value } });
const policy: StructuredPolicy = { id: 'p', version: '1', minimumRestDays: 1, maxWeeklySeconds: 5000, maxLongIncreaseSeconds: 100, taperWeeks: 1, taperMustNotIncrease: true };
const content = (): StructuredTemplate => ({ id: 'demo', version: '1', goal: 'fixture', intendedRunner: 'test only', prerequisites: ['test'], author: 'fixture', rights: 'test', contentStatus: 'demo', sourceUrls: [], reviewer: null, reviewDate: null, policy: { id: 'p', version: '1' }, sessions: [{ id: 's', role: 'long', purpose: 'Fixture', variantIds: ['standard'], standardVariantId: 'standard' }], variants: [{ id: 'standard', level: 'standard', purpose: 'Fixture', applicableTo: ['s'], steps: [step('seconds', 300)], declaredTotals: { seconds: 300, meters: null } }], weeks: [{ number: 1, phase: 'foundation', sessions: [{ sessionId: 's', variantId: 'standard', weekday: 1 }] }, { number: 2, phase: 'taper', sessions: [{ sessionId: 's', variantId: 'standard', weekday: 1 }] }] });

it('retains repeated step structure and calculates only known dimensions', () => {
  const repeated = [{ kind: 'repeat' as const, count: 3, steps: [step('seconds', 60), step('seconds', 30)] }];
  expect(stepTotals(repeated)).toEqual({ seconds: 270, meters: null });
  expect(stepTotals([step('meters', 500)])).toEqual({ seconds: null, meters: 500 });
  expect(stepTotals([step('seconds', 60), step('meters', 500)])).toEqual({ seconds: null, meters: null });
  const fixture = content(); fixture.variants[0].steps = repeated; fixture.variants[0].declaredTotals.seconds = 270;
  expect(validateStructuredTemplate(fixture, policy).status).toBe('valid'); expect(schedulerCapabilities(fixture)).toContainEqual({ code: 'repeated_steps_unsupported', path: 'standard' });
});
it('rejects invalid targets, totals and variant references', () => {
  const fixture = content(); fixture.variants[0].steps = [step('seconds', -1)]; fixture.sessions[0].variantIds.push('missing');
  expect(validateStructuredTemplate(fixture, policy).issues.map((i) => i.code)).toEqual(expect.arrayContaining(['invalid_step', 'total_mismatch', 'incompatible_variant']));
  fixture.variants.push({ ...fixture.variants[0], id: 'other', level: 'easier', applicableTo: ['s'], steps: [step('meters', 100)], declaredTotals: { seconds: null, meters: 100 } }); fixture.sessions[0].variantIds.push('other');
  expect(validateStructuredTemplate(fixture, policy).issues.map((i) => i.code)).toContain('incompatible_variant');
  const badUnit = content(); badUnit.variants[0].steps = [{ ...step('seconds', 10), target: { unit: 'miles' as 'seconds', value: 10 } }];
  expect(validateStructuredTemplate(badUnit, policy).issues.map((i) => i.code)).toContain('invalid_step');
});
it('reports missing policy or uncheckable duration without treating it as a pass', () => {
  expect(validateStructuredTemplate(content(), null).status).toBe('unvalidated');
  const fixture = content(); fixture.variants[0].steps = [step('meters', 1000)]; fixture.variants[0].declaredTotals = { seconds: null, meters: 1000 };
  expect(validateStructuredTemplate(fixture, policy).status).toBe('unvalidated'); expect(schedulerCapabilities(fixture)).toContainEqual({ code: 'distance_target_unsupported', path: 'standard' });
});
it('checks missing weeks, cross-week recovery, progression and taper', () => {
  const fixture = content(); fixture.weeks[0].sessions[0].weekday = 6; fixture.weeks[1].sessions[0].weekday = 0;
  expect(validateStructuredTemplate(fixture, policy).issues.map((i) => i.code)).toContain('recovery_spacing');
  const changed = content(); changed.variants.push({ ...changed.variants[0], id: 'harder', level: 'harder', steps: [step('seconds', 500)], declaredTotals: { seconds: 500, meters: null } }); changed.sessions[0].variantIds.push('harder'); changed.weeks[1].sessions[0].variantId = 'harder';
  expect(validateStructuredTemplate(changed, policy).issues.map((i) => i.code)).toEqual(expect.arrayContaining(['long_progression', 'taper_increase']));
  changed.weeks[1].number = 3; expect(validateStructuredTemplate(changed, policy).issues.map((i) => i.code)).toContain('invalid_week');
  const empty = content(); empty.weeks = []; expect(validateStructuredTemplate(empty, policy).issues.map((i) => i.code)).toContain('missing_weeks');
});
it('resolves exact archived versions and never silently falls forward', () => {
  expect(bundledTemplateCatalog.resolve('demo:half-marathon-completion', '0.1.0-demo', '0.1.0-demo')).toMatchObject({ kind: 'found', template: { semanticVersion: '0.1.0-demo' } });
  expect(bundledTemplateCatalog.resolve('demo:half-marathon-completion', '9.0.0', '0.1.0-demo')).toMatchObject({ kind: 'unavailable', code: 'template_version_unavailable' });
  expect(bundledTemplateCatalog.resolve('demo:half-marathon-completion', '0.2.0-demo', '9.0.0')).toMatchObject({ kind: 'unavailable', code: 'policy_version_unavailable' });
});
