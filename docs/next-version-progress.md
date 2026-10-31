# Next version: audit and implementation checklist

> Deferred on 2026-10-29. The active product priority is the local outdoor tracker recorded in `tracker-product-progress.md`. This planning/template work is preserved but inactive.

Last updated: 2026-10-26. This is a progress record, not a claim of completed coaching content.

## Current state and reusable flow

- Expo 58, React Native, Expo Router, TypeScript, SQLite, Supabase auth and local notification dependencies are in `package.json`; `app.json` and `scripts/build-android.ps1` configure the native build. No location, GPS, map or background-task package was found in the package manifest.
- Onboarding collects recent minutes, longest session/date, comfortable duration, interruption, goal, dates, availability, units and timezone in `src/app/onboarding/[step].tsx`; drafts are saved by `src/data/onboardingDraftRepository.ts`.
- `src/application/activateDemoOnboarding.ts` selects fixture content, generates assignments and stores the plan. The deterministic logic and fixture content live in `src/domain/training/engine.ts` and `demoContent.ts`. Available fixtures are 5K, 10K and half-marathon, each with two fixed three-day patterns. Their numbers are synthetic, not research-derived prescriptions.
- Today, Plan, History and detail use `src/app/(tabs)/`, `src/app/workout/[sessionId].tsx` and execution view models. `recordSessionOutcome.ts` records actuals and invalidates recommendations; `planReview.ts` assesses and `applyAdjustment.ts` commits a revision. `reminderRefresh.ts` and `src/services/reminders/reconcile.ts` reconcile notifications after changes. Preserve this shared flow for future activity sources.
- SQLite migrations and repositories are in `src/data/migrations.ts` and `repositories.ts`. Revision records carry template and rule versions; assignment prescriptions are stored with the revision, so changing a bundled template does not rewrite stored historical assignments. Existing profile columns are nullable for older installations.

## Contracts and migration sequence

The existing `PlanTemplate`, `SessionBlueprint`, `RuleConfig`, `PlanRevision` and `SessionAssignment` are the integration points. A target is identified by its original unit; distance scheduling stays unsupported until a reviewed, explicit time-budget policy exists. Source and content status metadata are additive. No database migration is required for this change: template data remains bundled, and existing revisions already store the template/rule version and prescriptions. A future migration should add template identity/version only if a separate durable content catalog becomes necessary; never reset or overwrite existing revisions. Existing versions must remain resolvable for future replanning or return an explicit unsupported result.

Remaining contract work: structured easier/harder variants, typed step kinds, complete mixed-unit validation, explicit content version registry and policy-specific weekly/long-run/taper validation at catalog load. Production content requires author, rights, reviewer/date, an approved full-session library and numerical policy including entry, progression, recovery, taper, interruptions and return-to-running. See `training-policy.md`.

## Phase checklist

- [x] Audit major components and preserve existing local changes; trace the existing workflow above.
- [x] Research initial competitor and running-organization sources; record known limitations and rights in `next-version-research.md`.
- [x] Add content metadata and explicit time/distance target types; validate basic content, step totals, phase order and cross-week spacing.
- [x] Block production use of an unreviewed rule configuration and reject distance scheduling without a supported time policy.
- [ ] Complete the full versioned catalog contract and validate all variants, all explicit weeks, independent load progression and taper rules.
- [ ] Author original or properly licensed half-marathon content and obtain qualified independent review of its policy and rights. Until then every runnable template is a development fixture.
- [ ] Research and document remaining TrainAsONE behavior from accessible official documentation; access was restricted during this audit.
- [ ] Add other families only after their prerequisites, content and policy have adequate support and review.
- [ ] Verify onboarding → activation → outcome → review → revision → reminders on a device, including offline relaunch. Automated checks do not establish device behavior.

Progress note: existing plans and outcomes are untouched by these code changes. The audit identified that production content and a distance-aware scheduler are release dependencies, not evidence that the requested full template library is complete.

## Phase 2 continuation — 2026-10-26

| Acceptance criterion | Evidence and current status |
| --- | --- |
| Step types, repeats, unit-specific totals | `structuredContent.ts` models warm-up/work/recovery/cooldown and repeated blocks; `structuredContent.test.ts` tests time, distance and mixed totals. Mixed workouts have unknown complete duration and distance; no pace is inferred. |
| Variants | The structured contract models easier/standard/harder references and checks purpose, applicability and unit compatibility. Test fixtures exercise broken references. These contracts are not yet connected to the runnable legacy scheduler or workout UI. |
| Explicit weeks and policy | The new contract requires explicit week records and checks order, recovery across weeks, weekly duration, long-run changes and taper against a versioned policy. Missing policy or unavailable duration produces an unvalidated state. The runnable legacy template type still allows phase fallback; full catalog integration remains open. |
| Exact historical versions | `templateCatalog.ts` resolves exact IDs and versions and returns a recoverable missing-content error. It includes the previously committed 0.1.0 demo definitions and current 0.2.0 versions. `planReview.ts` resolves the stored version before reassessment. Existing assignment snapshots remain the display source. |
| Provenance | New demo activation records template/policy provenance in revision explanation JSON; adjustment revisions carry it forward. Older records may lack this metadata and are not backfilled. Other production activation paths still need a fully validated structured content integration. |
| Scheduler capability | The structured capability check flags distance targets and repeated blocks; the legacy generator also rejects distance targets. The structured contract is not yet passed into the production or demo generation pipeline, so this is not complete end-to-end scheduler integration. |
| Migration and preservation | No schema change was necessary. Existing stored prescription snapshots and migration tests remain in place. A device relaunch has not been verified for this change. |
| Training content | No externally derived runnable prescription was added: B.A.A. expressly restricts repurposing and NYRR reuse permission remains unconfirmed. The only runnable content remains synthetic demo. No professionally reviewed production content or numerical policy exists. |

Phase 2 remains **incomplete**: connect the structured model and catalog to selection, generation, activation, UI and persisted snapshots; define and validate full required availability/frequency and structured variant semantics; enforce production activation on a complete validated policy; cover all applicability and mixed-target cases; and validate policy-specific phase/taper transitions end to end. Support for distance-based scheduling requires an explicit, reviewed way to evaluate full-session time availability without inventing pace, plus UI, persistence, and constraint checks; this is a later phase, not implemented here.

## Phases 3–4 progress

- [x] Existing outcome → persisted review → confirmation/proposal → transaction → reminder refresh path inspected and reused. Revisions and outcomes remain local and offline-capable.
- [x] Added an optional immediate effort check-in (1–10 and comparison to expectation), preserving old free-text records. A saved easy/as-expected response can maintain a validated schedule; absent comparison remains unknown and harder responses require review. A single easier run does not increase work. Pain/illness uses the existing health hold.
- [x] A later log and a stale apply cannot clear an existing health hold. Logging rejects a stale revision and the form guards repeated taps.
- [x] Selection filters out templates whose complete generated schedule does not fit; deterministic ranking uses ordered compatibility criteria. The selected demo explanation is saved and shown on Plan. Failure messages identify dates, time limits, unavailable dates or supported patterns where possible.
- [x] Proposal evidence records activity and resolution IDs plus template/policy versions. Existing fingerprints and transactional apply guard stale reviews; outcomes survive review and reminder failures.
- [ ] Complete Phase 2 structured content integration before claiming supported session-variant selection or real coaching. Bundled content currently supports only two authored three-day patterns; the scheduler is not a general flexible scheduler.
- [ ] Use distance-based baseline, consistency, completion/time goals and recent activity in an approved selection policy; these are not fully represented or consumed. Missing values must remain unknown.
- [ ] Implement recent-history observation windows, recovery check-ins, supported easier/harder variants, applied-evidence tracking and non-oscillating progression/reduction once original content and an approved policy exist. Current handling intentionally offers review rather than inventing thresholds or changes.
- [ ] Verify the full onboarding → log → review → apply → restart → reminders journey on a device, including large text and accessibility. Automated tests do not establish device behavior.

No migration was needed for the new check-in: structured feedback is versioned JSON in the existing nullable `reported_effort` field; historical free text remains intact and is not assumed to be a structured answer. Numerical demo schedule limits are fixtures and are not production policy. Phases 3 and 4 remain incomplete.
