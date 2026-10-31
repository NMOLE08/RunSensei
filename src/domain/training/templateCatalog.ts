import { demo5kTemplate, demo10kTemplate, demoHalfRules, demoHalfTemplate } from './demoContent';
import { archivedDemoTemplates } from './demoContentV010';
import { flexibleDemoTemplates } from './demoFlexibleContent';
import type { PlanTemplate, RuleConfig } from './content';

export type CatalogResolution = { kind: 'found'; template: PlanTemplate; policy: RuleConfig } | { kind: 'unavailable'; code: 'template_version_unavailable' | 'policy_version_unavailable'; message: string };

/** Append immutable versions; never replace an entry to update its content. */
export class TemplateCatalog {
  constructor(private readonly templates: readonly PlanTemplate[], private readonly policies: readonly RuleConfig[]) {
    const keys = templates.map((t) => `${t.id}@${t.semanticVersion}`); const policyKeys = policies.map((p) => `${p.id}@${p.semanticVersion}`);
    if (new Set(keys).size !== keys.length || new Set(policyKeys).size !== policyKeys.length) throw new Error('Duplicate content version');
  }
  resolve(id: string, version: string, policyVersion: string): CatalogResolution {
    const template = this.templates.find((t) => t.id === id && t.semanticVersion === version);
    if (!template) return { kind: 'unavailable', code: 'template_version_unavailable', message: 'This plan version is unavailable. Saved workouts remain available; review the plan before changing it.' };
    const policy = this.policies.find((p) => p.id === template.ruleConfigId && p.semanticVersion === policyVersion);
    return policy ? { kind: 'found', template, policy } : { kind: 'unavailable', code: 'policy_version_unavailable', message: 'This plan’s policy version is unavailable. Saved workouts remain available; review the plan before changing it.' };
  }
}
export const bundledTemplateCatalog = new TemplateCatalog([...archivedDemoTemplates, demo5kTemplate, demo10kTemplate, demoHalfTemplate, ...flexibleDemoTemplates], [demoHalfRules]);
