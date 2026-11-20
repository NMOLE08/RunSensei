import type { FitnessAssessmentDraft, FitnessAssessmentResult, RunnerClassification } from './types';
import { assessmentEvidenceFingerprint } from './assessmentEvidence';

const positive = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Evidence assessment only. It does not prescribe workload or declare a medical clearance. */
export function assessFitness(draft: FitnessAssessmentDraft, now = new Date().toISOString()): FitnessAssessmentResult {
  const missing: string[] = [];
  const weeklyMinutes = positive(draft.weeklyMinutes); const longest = positive(draft.longestSessionMinutes); const comfortable = positive(draft.comfortableRunMinutes);
  if (!weeklyMinutes && !positive(draft.weeklyDistance)) missing.push('recent weekly running');
  if (!longest || !date(draft.longestSessionDate)) missing.push('recent longest session');
  if (!comfortable) missing.push('comfortable continuous running duration');
  if (draft.interruption === 'unknown') missing.push('recent interruption');
  if (!draft.goal) missing.push('goal');
  if (!draft.trainingDays.length) missing.push('available training days');
  const reasons: string[] = [];
  let code: FitnessAssessmentResult['code'] = 'eligible_for_policy_selection';
  if (draft.healthConcern || draft.interruption === 'health_related') { code = 'health_hold'; reasons.push('A health concern needs the separate review pathway.'); }
  else if (draft.interruption === 'over_four_weeks') { code = 'needs_reassessment'; reasons.push('A long interruption means current running capacity should be reassessed.'); }
  else if (missing.length) { code = 'insufficient_information'; reasons.push('Some baseline facts are unknown, so readiness cannot be inferred.'); }
  else if ((comfortable ?? 0) < 20 || (longest ?? 0) < 20) { code = 'needs_base_build'; reasons.push('Current repeatable running evidence does not yet match the supported beginner-to-5K candidate entry evidence.'); }
  else if (draft.goalDateFixed && (!date(draft.goalDate) || draft.goalDate <= now.slice(0, 10))) { code = 'goal_date_incompatible'; reasons.push('A fixed goal date must be after today.'); }
  else if (draft.goal === '5k' && draft.goalDateFixed && Math.floor((Date.parse(`${draft.goalDate}T00:00:00Z`) - Date.parse(`${now.slice(0, 10)}T00:00:00Z`)) / 86400000) < 56) { code = 'goal_date_incompatible'; reasons.push('The selected date is shorter than the currently bundled draft 5K candidate window.'); }
  else reasons.push('Your baseline facts can now be compared with available policy content. This is not automatic approval of a training plan.');
  const classification: RunnerClassification = missing.length ? 'insufficient_information' : (comfortable ?? 0) < 30 || (weeklyMinutes ?? 0) < 90 ? 'beginner' : (weeklyMinutes ?? 0) < 240 ? 'intermediate' : 'advanced';
  const confidence = draft.performanceQuality === 'reliable' ? 'reliable' : weeklyMinutes && longest && comfortable ? 'approximate' : draft.performanceQuality === 'approximate' ? 'approximate' : 'unknown';
  const alternatives = code === 'needs_base_build' ? ['Build repeatable easy run-walk capacity, then reassess.', 'Choose a more flexible goal date.'] : code === 'goal_date_incompatible' ? ['Extend the goal date.', 'Choose a finish-focused or flexible goal.'] : code === 'insufficient_information' ? ['Add the missing baseline information.', 'Record a few RunSensei activities, then reassess.'] : [];
  return { version: 'system-a-v2', code, classification, confidence, reasons, missing, alternatives, inputFingerprint: assessmentEvidenceFingerprint(draft), createdAt: now };
}
