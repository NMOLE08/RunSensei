import { TrainingRepository } from '@/data/repositories';
import type { AuditEvent, PlanSnapshot } from '@/domain/training/entities';
import type { PlanPreview, PlanTemplate, RuleConfig } from '@/domain/training/content';

/** Explicit production persistence boundary. Generation remains entirely side-effect free. */
export async function activateGeneratedPreview(repository: TrainingRepository, preview: PlanPreview, template: PlanTemplate, policy: RuleConfig, snapshot: PlanSnapshot, event: AuditEvent): Promise<void> {
  void repository; void snapshot; void event;
  if (preview.mode !== 'real' || template.demoOnly || policy.demoOnly || template.reviewState !== 'reviewed' || policy.reviewState !== 'reviewed') throw new Error('Only reviewed non-demo content can activate a production plan');
  if (preview.templateId !== template.id || preview.templateVersion !== template.semanticVersion || preview.ruleVersion !== policy.semanticVersion) throw new Error('Preview content versions do not match activation content');
  // Until structured policy validation is wired into this boundary, fail closed.
  throw new Error('Production plan validation is not yet available.');
}
