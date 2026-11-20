# Research foundation outcomes and transitions

Status: implemented for development-only experimental use; Android acceptance remains outstanding. This is software verification, **not coaching approval**. No real account was populated with synthetic workouts or outcomes.

## Boundary and flow

The existing generator and immutable `runsensei.foundation.multiweek@0.2.0-draft` remain unchanged. The new decision policy is `runsensei.foundation.block_reassessment@0.1.0-draft`, an original candidate with no reviewer or claimed external endorsement.

1. The existing authenticated Plan adapter reads the persisted onboarding draft and matching assessment. An explicit **Save this research block** freezes its canonical evidence projection, constraints, policy-generated workouts and stable assignment IDs.
2. Migration 16 adds `research_foundation_blocks`, `research_foundation_outcomes`, and `research_foundation_decisions`. These never become production plans, revisions or assignments. Creation is idempotent by account plus full evidence/program identity, not a short hash.
3. The journal records explicit manual outcomes or associations with current account-owned `activity_logs` and standalone saved `tracking_sessions`. No synthetic ActivityLog is created. Original activity/recording rows remain unchanged. Associated metrics and source snapshots are retained; manually supplied running seconds are identified separately. Walking recordings remain `different_activity`. Unknown GPS distance quality is not upgraded.
4. Corrections append `previousVersionId`; removal appends a tombstone. Only the current non-removed outcome counts. Missing records remain **unreported**, not skipped. SQL uniqueness and serialized research writes reject correction forks. An activity and its correction family cannot satisfy two research assignments.
5. System D compares actual total time and actual running time with the immutable assigned steps. Historical evidence, assignments and prior decisions are retained. Lifecycle metadata is separate from immutable snapshots: saved, in-progress, outcomes-recorded, health-hold, successor-saved.
6. Explicit reassessment resolves the new transition policy. It records inputs, outcome IDs, reason codes, policy references and evaluation timestamp. Supported successor generation re-evaluates current evidence, rejects stale outcome revisions, invokes the existing generator/scheduler/independent validator, then saves a separate child block with decision provenance.
7. The child block renders through `FoundationProgramPreview`. The original remains available through **Saved research blocks**, including after onboarding edits. The ultimate goal is preserved. Opening either screen never starts tracking, completes workouts or activates reminders.

## Decision order and limitations

| Priority | Evidence | Result |
|---|---|---|
| 1 | Any historical research pain/injury concern, including corrected/removed records, or current health concern | Health review hold; no clearing mechanism or successor authorized |
| 2 | Wrong lineage, unsupported policy, conflicting factual data | Review hold or explicit policy gap |
| 3 | Current unusual fatigue or interruption | Review hold |
| 4 | Unreported workouts or missing comparable total/running evidence | Specific insufficient-evidence action |
| 5 | Partial, explicitly skipped or different-activity outcomes; shortened workouts | Policy gap; no invented repeat/reduction |
| 6 | Difficult workout or missing explicit comfortable/no-fatigue/no-discomfort feedback | Review or missing-feedback result; no numerical RPE threshold |
| 7 | Actual dates violate sequence/recovery; evidence not reconfirmed after the block | Review or request current confirmation |
| 8 | Confirmed capacity, actual availability, future start and goal constraints permit exact foundation generation | Draft successor, independently validated |

All assigned workouts must be explicitly completed and have comparable actual total and running duration at least their respective prescribed durations. This is an **original categorical candidate**, not an injury-safety threshold. Actual recovery spacing and the next block boundary reuse the existing foundation rest-day parameter. No new load-increase percentage, pace, detraining multiplier or race-readiness formula was added.

Supported transitions: continue foundation from newly confirmed current evidence; walk/run foundation to continuous foundation when the runner explicitly reports currently training and the existing generator produces continuous sessions within confirmed capacity. Completion itself never increases the starting workload.

Not supported: automatic repeats/regressions; clearance after a health hold; transitions into aerobic-base or race-preparation programs without an authored exit/entry transition policy. The existence of a half-marathon generator does not authorize a foundation-to-race transition. The 10K and marathon numerical engines are outside this milestone.

## Reproducible examples

Export with `EXPORT_RESEARCH_FOUNDATION=true` while running `tests/application/researchFoundationIntegration.test.ts`. These tests use a supplied synthetic date of 2027-02-01 and mock account facts; they do not touch the device database.

| Example | Current evidence | Verified result |
|---|---|---|
| `artifacts/foundation/reassessment/current.json` | 50 running minutes/week; 45 continuous minutes; historical longest 75 minutes remains historical; Tue/Thu/Sun, confirmed 45-minute limits | Original and successor: 12 sessions across four weeks; 50/53/56/50 running minutes; 80/83/86/80 total minutes. Successor starts Tue 2027-02-02. Ultimate half-marathon goal retained. |
| `beginner.json` | First-time 5K goal, 5 running minutes/week, 30-second repeatable bouts | Original walk/run steps. After all recorded outcomes and a separately confirmed 10-minute continuous capability, successor has continuous steps. No capability is inferred from elapsed weeks. |
| `returning.json` | Historical interruption and explicit post-break 5-minute/week, 30-second-bout evidence | Original return walk/run block; after completed evidence and an explicit currently-training reassessment, supported continuous-foundation successor. |
| `health-hold.json` | Explicit existing activity association with a reported concern, subsequently removed | Source activity unchanged, current workout unreported, historical health hold preserved. |

Each successful JSON includes the entire original and next program, structured workout steps, source evidence, System D comparisons, insufficient-evidence example, exact transition decision and independent validation. No event duration or mileage is fabricated.

For the 50-minute runner, each Week 1 workout is: **walk 300 seconds → run 1,000 seconds conversationally → walk 300 seconds**. Three workouts total **3,000 running seconds + 1,800 walking seconds = 4,800 scheduled seconds**. Merely finishing that block does not change this baseline.

## Main implementation locations

- `src/domain/planning/researchFoundation.ts`: immutable snapshot adapter, current outcome selection, factual analysis and pure draft reassessment.
- `src/application/researchFoundation.ts`: authenticated experimental access, current assessment matching, native activity association, reassessment and successor orchestration.
- `src/data/researchFoundationRepository.ts` and migration 16: owner-scoped research ledger, idempotency and stale-correction protection.
- `src/features/execution/ResearchFoundationProgress.tsx`: outcome editor, current facts, correction history, saved decisions and explicit next-block action.
- `src/app/research-foundation.tsx`: guarded saved-history route. `FoundationProgramPreview.tsx` retains existing week navigation/steps and renders selected saved blocks.
- `src/app/onboarding/[step].tsx`: explicit current-facts confirmation button in experimental running-information review. Saving uses the existing synchronized draft/assessment flow. Merely opening a screen does not change evidence dates.
- `src/data/repositories.ts`: existing owner-scoped export/delete includes the three new research tables; no other account is selected.

## Android acceptance

Use the existing development build with `EXPO_PUBLIC_EXPERIMENTAL_5K_PREVIEW=true`. No native module or dependency was added, so this change alone does not require rebuilding the development client.

1. Open Plan with a compatible saved current assessment. Verify the existing four-week calendar, ultimate goal, running/walking totals and research warning. Tap **Save this research block** twice. Reopen Plan and **Saved research blocks**: one block, all outcomes unreported.
2. Expand a workout, choose **Record / correct outcome**. Enter truthful actual date, total seconds, running seconds (or leave unknown), feedback and optional RPE. Save. Verify one current outcome. Correct it, then remove the association: the workout becomes unreported, and both historical versions remain.
3. Associate an actual standalone saved Run recording. Verify recorded total/distance is reused, running time is not guessed, and the GPS recording remains in History unchanged. A Walk recording must show different activity. Trying to reuse the recording for another research workout must fail.
4. Request reassessment with pending workouts: expect a specific insufficient-evidence result, no generated block. Report a real concern only when truthful; test synthetic concerns in automated tests rather than polluting a real account. A recorded concern remains a hold after correction/removal.
5. After a genuinely completed block, open **Review and confirm current capacity**. Check the values, explicitly tap **I reviewed these facts — confirm current today**, and Save changes. Reopen the original saved research block, enter a future start and reassess. Only a supported decision exposes **Save and view next research block**. Verify both immutable blocks and their steps; no active production plan appears.
6. Reload the app and switch accounts. Saved research blocks/outcomes must reload only for their owner. A release build or disabled experimental flag must not load the research route.

Physical Android was not verified in this implementation session: ADB exited with `Cannot mkdir '\\.android': Permission denied` even after selecting the existing Android user-home location. No phone records were modified. React element/route tests verify structure and guards, not Android interaction, scrolling or native SQLite runtime behavior. Real SQLite migration checks ran on Python SQLite; application persistence integration uses an in-memory SQL test adapter.

## Review and release blockers

- Qualified review of the new categorical reassessment decisions and the existing numerical foundation policy; no reviewer or approval has been invented.
- Clinical review of symptom-escalation wording and any future health-hold clearance pathway.
- Explicit rules for incomplete-block repetition/reduction, aerobic-base progression and goal-specific transitions.
- Android acceptance, especially edits/reloads, real GPS association, simultaneous tracker/journal use, and account switching.
- Production authorization remains blocked for all these policies. No research block can be published through this feature.

## Verification and changed files

Verified: `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd test` (75 suites / 423 tests), `python PolicyPack/validate_policy_pack.py`, `python PolicyPack/foundation/validate_foundation.py`, and `python PolicyPack/foundation/validate_reassessment.py`. The new tests cover service orchestration, correction and duplicate protection, missing evidence, health holds, actual and cross-block recovery, date conflicts, real SQLite migration constraints, account isolation, research guards and generated element content. Native Android behavior is not inferred from these results.

Files changed specifically for this milestone (the workspace also contains unrelated earlier changes):

```text
PolicyPack/foundation/03_block_reassessment_v0.1.0_draft.json
PolicyPack/foundation/validate_reassessment.py
src/domain/planning/researchFoundation.ts
src/application/researchFoundation.ts
src/data/researchFoundationRepository.ts
src/data/migrations.ts
src/data/repositories.ts
src/features/execution/ResearchFoundationProgress.tsx
src/features/execution/FoundationProgramPreview.tsx
src/app/research-foundation.tsx
src/app/(tabs)/plan.tsx
src/app/onboarding/[step].tsx
tests/support/researchFoundationFixtures.ts
tests/domain/researchFoundation.test.ts
tests/data/researchFoundationRepository.test.ts
tests/data/researchFoundationMigration.test.ts
tests/application/researchFoundationIntegration.test.ts
tests/features/researchFoundationPreview.test.ts
artifacts/foundation/reassessment/current.json
artifacts/foundation/reassessment/beginner.json
artifacts/foundation/reassessment/returning.json
artifacts/foundation/reassessment/health-hold.json
docs/research-foundation-outcomes.md
docs/next-version-progress.md
```

Debugging: `current_account_assessment_required` means the saved assessment does not match canonical current answers; use the existing review/save flow, never relax matching. `stale_outcome_correction` means another outcome version is current; reload before editing. `confirm_current_capacity_after_block` requires an explicit dated confirmation after the original block and actual workouts. `comparable_total_and_running_duration_required` means GPS total time alone cannot prove the running portions. `cross_block_recovery_spacing` requires a later feasible next start, not a shortened rest requirement.
