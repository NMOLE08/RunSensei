import type { GoalFamily } from './multiDistancePolicy';

/**
 * Document metadata and known extraction warnings only. These are third-party
 * references, not RunSensei policies or runnable prescriptions.
 */
export type NyrrReference = { documentId: string; filename: string; goalFamily: GoalFamily; sourceLevel: 'conservative' | 'moderate' | 'advanced'; pages: number; weeks: number; runningDaysText: string; baselineLongestRunMinutes: number; warnings: readonly string[]; status: 'reference_only_unreviewed'; releaseEligible: false };
export const nyrrReferenceCatalog: readonly NyrrReference[] = [
  ref('nyrr-10k-conservative-v1', '10K Training Plan Conservative.pdf', '10k', 'conservative', 3, 12, '5–6 (source introduction; inconsistent with visible schedule)', 80, ['intro_frequency_and_baseline_conflict', 'alternatives_and_optional_sessions_require_preservation']),
  ref('nyrr-10k-moderate-v1', '10K Training Plan Moderate.pdf', '10k', 'moderate', 3, 12, '5–6', 80, ['distance_and_pace_sessions_cannot_be_converted_to_time_without_evidence']),
  ref('nyrr-10k-advanced-v1', '10K Training Plan Advanced.pdf', '10k', 'advanced', 3, 12, '5–6', 80, ['distance_repetitions_and_pace_offsets_need_separate_selection_rules']),
  ref('nyrr-half-conservative-v1', 'Half Marathon Training Plan Conservative.pdf', 'half_marathon', 'conservative', 2, 10, '3–4', 40, ['race_duration_unspecified']),
  ref('nyrr-half-moderate-v1', 'Half Marathon Training Plan Moderate-1.pdf', 'half_marathon', 'moderate', 2, 10, '4–5', 60, ['race_duration_unspecified']),
  ref('nyrr-half-advanced-v1', 'Half Marathon Training Plan Advanced.pdf', 'half_marathon', 'advanced', 2, 10, '5–6', 80, ['week_3_long_run_conflict_110_vs_100_minutes', 'race_duration_unspecified']),
  ref('nyrr-marathon-conservative-v1', 'Marathon Training Plan Conservative.pdf', 'marathon', 'conservative', 3, 18, '4–5', 40, ['page_header_week_count_inconsistent', 'ranges_and_optional_cross_training_preserved_as_unknown']),
  ref('nyrr-marathon-moderate-v1', 'Marathon Training Plan Moderate.pdf', 'marathon', 'moderate', 3, 18, '5', 50, ['page_header_week_count_inconsistent', 'ranges_and_optional_cross_training_preserved_as_unknown']),
  ref('nyrr-marathon-advanced-v1', 'Marathon Training Plan Advanced.pdf', 'marathon', 'advanced', 3, 18, '6', 50, ['week_14_long_run_editorial_inconsistency', 'distance_pace_sessions_require_reliable_performance_evidence']),
];
function ref(documentId: string, filename: string, goalFamily: GoalFamily, sourceLevel: NyrrReference['sourceLevel'], pages: number, weeks: number, runningDaysText: string, baselineLongestRunMinutes: number, warnings: string[]): NyrrReference { return { documentId, filename, goalFamily, sourceLevel, pages, weeks, runningDaysText, baselineLongestRunMinutes, warnings, status: 'reference_only_unreviewed', releaseEligible: false }; }
export function validateNyrrReferenceCatalog() { const keys = nyrrReferenceCatalog.map((item) => item.documentId); return { valid: nyrrReferenceCatalog.length === 9 && new Set(keys).size === 9 && nyrrReferenceCatalog.every((item) => item.status === 'reference_only_unreviewed' && !item.releaseEligible), references: nyrrReferenceCatalog }; }
