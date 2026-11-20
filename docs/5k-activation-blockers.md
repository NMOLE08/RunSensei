# Beginner 5K activation audit

Successful generation is research compatibility, not production authorization. No phone account was read during this audit. A successful preview does not report missing candidate inputs.

## Verified path

`openCurrentExperimental5kPreview` reads account-owned facts. `createExperimental5kPreview` checks the assessment fingerprint, selects an exact draft pathway, evaluates candidate compatibility and schedules/validates 36 sessions. It returns `researchOnly: true`, `productionEligible: false`; it performs no persistence. The preview component selects the `preview_available` consumer status.

`selectBeginner5kPathway` cannot return a production success: its final compatibility function always reports `starting_workload_compatibility_rule_missing` (and potentially legacy minute-limit evidence gaps). These internal legacy requirements must not be confused with missing inputs for the successful calendar-only preview.

## Exact approval requirements

- `runsensei.5k.beginner.personalization@0.3.0-draft`: reviewer, reviewDate and approvalScope are null; lifecycle draft and releaseEligibility blocked. Registry activation returns `policy_not_authorized`.
- `true_beginner_fixed_12_week_run_walk@0.1.0-draft`, linked to `runsensei.5k.first_5k_true_beginner_run_walk.pack@0.1.0-draft`: all nine referenced original policies at 0.1.0 require their reviewer identity, credentials, date, approval record and scoped release authorization. Their activation gates remain false.
- `runsensei.5k.beginner.workload-compatibility@0.4.0-draft` and its calendar successor `torto.5k.beginner.calendar_availability@0.5.0-draft`: require scoped review of entry workload and calendar-only feasibility, including explicit acknowledgment that personal time feasibility is not assessed.
- Supply identifiable signed approval records tied to exact versions/content, reviewer qualifications, review scope, date, decision and release authority. Software checks alone are not these records. Publish any changed content as new immutable versions.

## Lifecycle gaps

`publishAuthorizedPolicyWeek` implements atomic account-owned publication, retry lookup, exact references and test-policy exclusion. Its existing tests cover success, draft rejection, isolation and rollback. It publishes one week through `MultiDistancePolicyRegistry`, whose bundled catalog is empty. It is not connected to the fixed 5K preview. No end-to-end production 36-session activation exists today.

Before activation: review the exact approval artifacts; implement an approved compatibility result and exact approved catalog entry; preserve run/walk repetitions and event unknown duration in a production adapter; independently validate the full authored schedule; connect an explicit account-owned publication action; test retry/concurrency/provenance and active Week 1 rendering. Do not merely relabel or persist the research object.

Current supported UI correction: distinguish policy approval, authorization failure and persistence failure from runner-information states. Successful preview explains the internal activation blocker without sending users back through onboarding.
