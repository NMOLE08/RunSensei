/** Versioned content contract. Targets are prescribed values, never measured activity. */
export type Target = { unit: 'seconds' | 'meters'; value: number };
export type Step = { kind: 'warmup' | 'work' | 'recovery' | 'cooldown'; instruction: string; purpose: string; effort: string; target: Target };
export type StepNode = Step | { kind: 'repeat'; count: number; steps: Step[] };
export type VariantLevel = 'easier' | 'standard' | 'harder';
export interface Variant { id: string; level: VariantLevel; purpose: string; applicableTo: string[]; steps: StepNode[]; declaredTotals: { seconds: number | null; meters: number | null }; }
export interface Session { id: string; purpose: string; role: 'easy' | 'long' | 'quality'; variantIds: string[]; standardVariantId: string; }
export interface Week { number: number; phase: 'foundation' | 'endurance_development' | 'race_preparation' | 'taper'; sessions: { sessionId: string; weekday: number; variantId: string }[]; }
export interface StructuredTemplate { id: string; version: string; goal: string; intendedRunner: string; prerequisites: string[]; weeks: Week[]; sessions: Session[]; variants: Variant[]; policy: { id: string; version: string }; contentStatus: 'demo' | 'research_draft' | 'reviewed' | 'retired'; author: string; sourceUrls: string[]; rights: string; reviewer: string | null; reviewDate: string | null; }
export interface StructuredPolicy { id: string; version: string; minimumRestDays: number; maxWeeklySeconds: number; maxLongIncreaseSeconds: number; taperWeeks: number; taperMustNotIncrease: boolean; }
export interface Issue { code: string; path: string; }
export interface Validation { status: 'valid' | 'invalid' | 'unvalidated'; issues: Issue[]; }

/** A dimension is known only when every step uses that dimension. No pace conversion occurs. */
export function stepTotals(steps: StepNode[]): { seconds: number | null; meters: number | null } {
  const totals = { seconds: 0, meters: 0 }; const units = new Set<string>();
  for (const node of steps) {
    const children = node.kind === 'repeat' ? node.steps : [node];
    const count = node.kind === 'repeat' ? node.count : 1;
    for (const step of children) { if (step.target.unit === 'seconds' || step.target.unit === 'meters') { totals[step.target.unit] += count * step.target.value; units.add(step.target.unit); } }
  }
  return { seconds: units.size === 1 && units.has('seconds') ? totals.seconds : null, meters: units.size === 1 && units.has('meters') ? totals.meters : null };
}

export function validateStructuredTemplate(template: StructuredTemplate, policy: StructuredPolicy | null): Validation {
  const issues: Issue[] = []; const add = (code: string, path: string) => issues.push({ code, path });
  if (!template.id || !template.version || !template.goal || !template.intendedRunner || !template.author || !template.rights || !template.prerequisites.length) add('required_field', 'template');
  if (template.contentStatus === 'reviewed' && (!template.reviewer || !template.reviewDate || !template.sourceUrls.length)) add('missing_review_metadata', 'template');
  if (new Set(template.variants.map((v) => v.id)).size !== template.variants.length || new Set(template.sessions.map((s) => s.id)).size !== template.sessions.length) add('duplicate_id', 'template');
  const variants = new Map(template.variants.map((v) => [v.id, v])); const sessions = new Map(template.sessions.map((s) => [s.id, s]));
  for (const variant of template.variants) {
    if (!variant.id || !variant.purpose || !variant.steps.length || !variant.applicableTo.length || variant.applicableTo.some((id) => !sessions.has(id))) add('invalid_variant', variant.id);
    for (const node of variant.steps) {
      if (node.kind === 'repeat' && (!Number.isInteger(node.count) || node.count < 1 || !node.steps.length)) add('invalid_repeat', variant.id);
      for (const step of node.kind === 'repeat' ? node.steps : [node]) if (!['warmup', 'work', 'recovery', 'cooldown'].includes(step.kind) || !step.instruction || !step.purpose || !step.effort || !['seconds', 'meters'].includes(step.target.unit) || !Number.isInteger(step.target.value) || step.target.value <= 0) add('invalid_step', variant.id);
    }
    const total = stepTotals(variant.steps); if (total.seconds !== variant.declaredTotals.seconds || total.meters !== variant.declaredTotals.meters) add('total_mismatch', variant.id);
  }
  for (const session of template.sessions) {
    const standard = variants.get(session.standardVariantId);
    if (!session.id || !session.purpose || !standard || standard.level !== 'standard' || !session.variantIds.includes(session.standardVariantId)) add('invalid_standard_variant', session.id);
    const units = (v: Variant) => [...new Set(v.steps.flatMap((node) => (node.kind === 'repeat' ? node.steps : [node]).map((step) => step.target.unit)))].sort().join(',');
    for (const id of session.variantIds) { const v = variants.get(id); if (!v || !v.applicableTo.includes(session.id) || v.purpose !== session.purpose || (standard && units(v) !== units(standard))) add('incompatible_variant', `${session.id}:${id}`); }
  }
  const phaseOrder = ['foundation', 'endurance_development', 'race_preparation', 'taper']; let previousPhase = -1;
  for (const [index, week] of template.weeks.entries()) {
    const phase = phaseOrder.indexOf(week.phase); if (week.number !== index + 1 || !week.sessions.length || phase < previousPhase || phase < 0) add('invalid_week', `weeks.${index}`); previousPhase = phase;
    for (const item of week.sessions) { const s = sessions.get(item.sessionId); if (!s || !s.variantIds.includes(item.variantId) || !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) add('invalid_assignment', `weeks.${index}`); }
  }
  if (!template.weeks.length) add('missing_weeks', 'weeks');
  if (!policy || policy.id !== template.policy.id || policy.version !== template.policy.version) return { status: issues.length ? 'invalid' : 'unvalidated', issues: [...issues, { code: 'policy_unavailable', path: 'policy' }] };
  if (![policy.minimumRestDays, policy.maxWeeklySeconds, policy.maxLongIncreaseSeconds, policy.taperWeeks].every(Number.isFinite) || policy.minimumRestDays < 0 || policy.maxWeeklySeconds <= 0 || policy.maxLongIncreaseSeconds < 0 || policy.taperWeeks < 1) add('invalid_policy', 'policy');
  let previousDate: number | null = null; let previousLong: number | null = null; let previousWeekly: number | null = null; let unchecked = false;
  for (const [index, week] of template.weeks.entries()) {
    let weekly = 0; let known = true;
    for (const item of [...week.sessions].sort((a, b) => a.weekday - b.weekday)) {
      const date = index * 7 + item.weekday; if (previousDate !== null && date - previousDate <= policy.minimumRestDays) add('recovery_spacing', `weeks.${index}`); previousDate = date;
      const v = variants.get(item.variantId); const duration = v ? stepTotals(v.steps).seconds : null; if (duration === null) { known = false; unchecked = true; } else { weekly += duration; if (sessions.get(item.sessionId)?.role === 'long') { if (previousLong !== null && duration - previousLong > policy.maxLongIncreaseSeconds) add('long_progression', `weeks.${index}`); previousLong = duration; } }
    }
    if (known && weekly > policy.maxWeeklySeconds) add('weekly_load', `weeks.${index}`);
    if (week.phase === 'taper' && policy.taperMustNotIncrease && known && previousWeekly !== null && weekly > previousWeekly) add('taper_increase', `weeks.${index}`);
    previousWeekly = known ? weekly : null;
  }
  if (template.weeks.slice(-policy.taperWeeks).some((w) => w.phase !== 'taper') || template.weeks.filter((w) => w.phase === 'taper').length !== policy.taperWeeks) add('taper_length', 'weeks');
  if (unchecked) issues.push({ code: 'duration_policy_unchecked', path: 'weeks' });
  return { status: issues.some((i) => i.code !== 'duration_policy_unchecked') ? 'invalid' : unchecked ? 'unvalidated' : 'valid', issues };
}

/** The existing scheduler only handles flat, fully timed workouts. */
export function schedulerCapabilities(template: StructuredTemplate): Issue[] {
  const issues: Issue[] = [];
  for (const variant of template.variants) for (const node of variant.steps) {
    if (node.kind === 'repeat') issues.push({ code: 'repeated_steps_unsupported', path: variant.id });
    for (const step of node.kind === 'repeat' ? node.steps : [node]) if (step.target.unit === 'meters') issues.push({ code: 'distance_target_unsupported', path: variant.id });
  }
  return issues;
}
