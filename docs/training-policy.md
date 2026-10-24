# Training content and policy contract (Phase 0)

## Content status and release rule

This repository has **no reviewed production training template or numerical progression policy**. The candidate scope is a 16-week, three-running-days-per-week adult completion pathway, but its session lengths, entry thresholds, progression, taper, gap boundaries, and re-entry rules are deliberately unspecified until authored and reviewed.

Only original or permissively licensed content with recorded rights may enter production. A coding assistant must not fill these gaps with plausible values. Test fixtures may contain synthetic values only when `demoOnly: true`; they are never training advice and cannot activate a real plan.

## Schema contract

The following TypeScript-like contract is the required shape for later validation. It defines fields, not a completed prescription.

```ts
type ReviewState = 'draft' | 'reviewed' | 'retired';
type DateOnly = `${number}-${number}-${number}`;

interface ContentProvenance {
  author: string;
  reviewer?: string;
  reviewDate?: DateOnly;
  rightsSourceNotes: string;
  reviewState: ReviewState;
  demoOnly: boolean;
}

interface EntryRequirements {
  lookbackDays: number;
  requiredBaselineFields: string[];
  eligibilityRuleReference: string;
  unsupportedCohorts: string[];
}

interface SessionStep {
  kind: 'warmup' | 'main' | 'cooldown' | 'recovery' | 'other';
  instruction: string;
  target: { kind: 'duration_seconds' | 'distance_meters'; value: number };
  effortCue?: string;
}

interface SessionContent {
  role: 'easy' | 'long' | 'quality' | 'recovery' | 'rest' | 'other';
  purpose: string;
  priority: 'protected' | 'standard' | 'optional';
  totalTarget: { kind: 'duration_seconds' | 'distance_meters'; value: number };
  effortCue?: string;
  steps: SessionStep[];
  approvedAlternatives: string[];
}

interface PhaseContent {
  id: string;
  name: 'foundation' | 'endurance_development' | 'race_preparation' | 'taper' | 'recovery' | 'other';
  weekRange: { start: number; end: number };
  sessions: SessionContent[];
}

interface PlanTemplate extends ContentProvenance {
  id: string;
  semanticVersion: string;
  engineCompatibility: string;
  supportedGoal: 'half_marathon_completion';
  trainingFrequencyPerWeek: 3;
  authoredDurationWeeks: number;
  entryRequirements: EntryRequirements;
  allowedWeeklyPatterns: string[][];
  phases: PhaseContent[];
  ruleConfigId: string;
}

interface RuleConfig extends ContentProvenance {
  id: string;
  semanticVersion: string;
  engineCompatibility: string;
  progressionPolicyReference: string;
  weeklyLoadConstraint: unknown;
  independentLongRunConstraint: unknown;
  recoverySpacingConstraint: unknown;
  protectedTaperConstraint: unknown;
  gapCategories: Array<{ id: string; conditionReference: string }>;
  reentryVariants: Array<{ id: string; approvedForGapCategoryIds: string[] }>;
  fixedDateFeasibilityRuleReference: string;
}
```

All numerical targets are canonical integers: seconds for time and meters for distance. Templates must include full session time, not merely the main running block. `unknown` policy fields are intentionally opaque at this stage: their eventual structures and values require authored review.

## Required review and validation

Later schema validation must require a matching template/policy compatibility range; semantic versions; complete provenance; non-retired content; one allowed schedule pattern that respects declared recovery spacing; phases covering the authored duration; and documented fixed-date feasibility, long-run, weekly-load, taper, gap, and re-entry rules.

Production activation must reject any content where `demoOnly` is true, `reviewState` is not `reviewed`, author/reviewer/review date/rights notes are missing, required policy clauses are absent, or engine compatibility fails. A rejected content item returns `no_reviewed_content`, not an invented fallback plan.

## Adjustment decision table

This table specifies product behavior. Any evaluation under “reviewed policy” is deferred until an approved RuleConfig exists.

| Trigger | Required result | Non-negotiable constraint |
| --- | --- | --- |
| Unlogged past session | `unresolved_session`; ask whether it happened. | Never assume a skip or deduct fitness. |
| One ordinary run explicitly missed | Reviewable proposal may drop it or offer a valid move. | Never stack/repay mileage. |
| Long run missed | Validate later long work against actual history. | Do not credit the missed run. |
| Partial completion | Preserve actual duration/effort and assess under policy. | Never convert it to full completion. |
| Different/extra activity | Record separately; optionally offer explicit session match. | Do not auto-credit unrelated work. |
| Sustained interruption | `needs_reassessment`; request reason/current capacity and select only an approved re-entry variant. | Gap boundaries are authored, not inferred. |
| Several weeks away | `needs_reassessment`; recheck fixed-date feasibility. | Do not resume the old calendar week automatically. |
| Illness/discomfort flag | `health_hold`. | No diagnosis, clearance, pressure, or humor. |
| Reduced availability | Find a template-supported pattern or `availability_incompatible`. | Do not delete a day from an unrelated template. |
| Absence near race | Reassess while preserving protected taper. | No late catch-up long run. |
| Race date changed | Rebuild future work as a proposal. | Preserve completed facts. |

Every proposal carries before/after future assignments, reason codes, constraint results, target-date effect, base revision, and source-input fingerprint. Application rechecks the fingerprint and applies atomically; cancelled or stale proposals never restore incompatible recommendations.
