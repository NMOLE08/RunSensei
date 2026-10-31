# Workout feedback and plan personalization

## Verified starting point

The implementation review confirmed that the previous planner reduced the collected baseline to `entryRequirementsMet`, selected the first sorted compatible template, invalidated every plan after logging without exposing reassessment in the UI, offered only two fixture schedule patterns, and repeated one session set throughout each phase. There is still no reviewed production training template or numerical policy. The bundled 5K, 10K, and half-marathon data remains synthetic, `demoOnly`, and `draft`.

## Feedback loop

The app now follows this sequence:

1. `recordSessionOutcome` saves the activity, resolution, audit event, and recommendation invalidation in one SQLite transaction. Repeated taps use the resolution event key and do not duplicate the fact.
2. Reminder reconciliation runs after the activity transaction. Failure cannot roll back the activity and is shown as retryable.
3. `/plan-review` reloads the active revision, recorded facts, goal, and availability, then calls the pure adjustment engine.
4. The result is persisted in `adjustment_proposals` and `plan_review_state` so an interrupted review can be reconstructed after restart.
5. A valid no-change result is explicitly confirmed and atomically returns the plan to `active`. A proposal shows affected dates and targets before the user applies it.
6. Confirmation recomputes the proposal and compares both the active revision/fingerprint and the outcome-derived input fingerprint. Stale reviews are rejected.
7. A changed schedule creates an immutable future revision transactionally. Historical revisions and activity facts remain unchanged.
8. Today and Plan reload from the new active pointer. Reminders are reconciled against the committed state with their opt-in preference stored separately from native reminder records.

`health_hold` is never cleared by this normal path. Dismissing a proposal leaves it unapplied and keeps the plan awaiting review. A missed ordinary session is left behind rather than moved or repaid. Partial duration remains its actual value. Unsupported long-session changes return review-required when authored steps cannot be reconciled.

## Baseline and structure selection

`RunnerProfile` and schema migration 8 represent recent weekly minutes and unit, the lookback period, recent longest session and date, comfortable duration, and interruption status explicitly while retaining `baseline_json` for backwards compatibility. Old rows contain `NULL` in new columns and are treated as missing information; they are never silently made eligible.

Planning is separated into testable stages:

- `assessBaseline` checks fields and content-authored compatibility criteria.
- `selectTemplate` filters goal, content mode, baseline criteria, policy compatibility, frequency, and availability before stable ranking.
- `chooseSessionParameters` selects explicit authored week content.
- `scheduleSessions` deterministically maps the chosen structure onto an allowed day pattern.
- `validatePlanConstraints` checks availability, full duration, step totals, weekly totals, long-session progression, unavailable dates, and recovery spacing—including Sunday-to-Monday.

Template frequency is no longer hard-coded to three in the engine. Each supported frequency must be a separately authored template variant with its own allowed patterns and weekly content. The current app still exposes only the two three-day patterns because those are the only bundled fixture structures. No lower- or higher-frequency production structure is invented.

## Content status and unsupported cases

All bundled numerical values and compatibility declarations are development fixtures. They are visibly labelled and cannot activate a real-mode plan. Production remains blocked until an original template and numerical policy have documented provenance, rights, author, qualified reviewer, review date, and reviewed entry/progression/re-entry rules.

The planner returns explicit unsupported or review-required results for missing baseline fields, an incompatible authored baseline band, unsupported goal/frequency/availability, missing prescription details, unresolved past sessions, repeated skips/interruption, fixed-date conflicts, protected-final-week absences, and health holds.

## Migration behavior

Migration 8 only adds nullable profile columns and the `plan_review_state` table. It does not delete or reset profiles, plans, activities, revisions, or reminders. The migration remains transactional. JSON export now identifies schema version 8 and includes pending review state separately from activities and prescriptions.

## Manual verification

1. Use the local demo account and complete onboarding, including a positive history period such as 28 days. Activate a visibly labelled demo plan.
2. Open a scheduled workout and record **As planned**. Verify the outcome-saved screen assesses the plan and offers **Confirm current plan** when no change is needed.
3. Confirm, return to Today and Plan, and verify sessions are visible again.
4. Record **Partial** or **Did not run**. Verify the review explains whether no change, a supported future change, or manual review is required. A missed workout must not be added to another day.
5. For a proposal, compare before/after date and duration, tap **Not now**, and verify the active plan remains awaiting review. Reopen Review and apply once; repeated application must not create another revision.
6. Enable reminders in Settings. Log an outcome and verify obsolete reminders are suppressed. Confirm/apply and verify reconciliation can be retried without duplicate scheduling.
7. Force-close and reopen after logging and after applying. Verify the saved outcome, active revision, History, Today, and Plan remain consistent.

## Future integration boundaries

Strength requires a reviewed exercise library, equipment requirements, substitutions, prescription units, progression rules, and its own compatibility/validation contract. It should contribute structured sessions through the same immutable revision pipeline.

Nutrition requires explicit preferences and allergies, reviewed recipes, source/provenance records, and reviewed nutrient calculations. It must not infer medical dietary advice or modify run prescriptions implicitly.

Optional AI may later call a server-side endpoint such as a Supabase Edge Function. It may explain a validated local result or return a structured change request for the local engine to validate. It must never hold model keys in the app, write plan revisions directly, bypass policy validation, or make offline planning depend on network availability. No AI package or endpoint is included now.

## Onboarding and flexible demo schedules (2026-10)

The app bundles three synthetic completion examples (5K, 10K, and half marathon). Version 0.3.0-demo reuses their existing workouts, but allows three selected weekdays when the existing synthetic rule of at least one rest day between sessions is satisfied, including across the week boundary. It tries compatible assignments deterministically and checks full workout durations, the preferred longer-session day, and unavailable dates. Historical 0.2.0-demo versions remain in the catalog. Unsupported days, minutes, dates, missing answers, interruptions, and health concerns do not produce a fabricated schedule.

The goal selects a demo family; the schedule assumptions affect placement. Baseline values are saved and checked for presence, but the current demo templates do not have reviewed baseline bands, so different histories can still receive identical synthetic prescriptions. Onboarding no longer asks the runner to claim that they match a preset template: complete, honest baseline values can activate the matching 5K, 10K, or half-marathon demo family. No real individualized prescription can be provided until qualified authors/reviewers supply original content, eligibility and progression rules, and documented rights. Past start dates are rejected on the review screen using the selected timezone.

Onboarding no longer collects detailed availability. Its review screen identifies the synthetic Tuesday/Thursday/Sunday demo schedule and states that real availability is not checked. Demo minute limits are derived from the fixture sessions, not asserted as runner availability. Existing saved drafts and plan scheduling/validation structures are retained for compatibility; the assumed availability is marked in the saved demo profile.

## Account-owned generation (2026-10-27)

Migration 11 adds owner identifiers to profiles, plans, activity logs, and reminders without resetting earlier rows. New onboarding activation requires the current local/Supabase account, generates unique profile/goal/availability/plan/revision/session/assignment identifiers, and persists the initial revision atomically. Today, Plan, History, feedback review, reminders, and GPS recovery resolve data through the active account. New outcomes are owned by that account, and feedback proposals continue to rebuild future assignments only while preserving historical assignments and facts.

The deterministic stages remain baseline completeness/compatibility, exact goal-family filtering, stable template ranking, fixture schedule assignment, full constraint validation, and immutable persistence. The saved revision includes the baseline inputs and selection explanation. There are still no reviewed production templates or reviewed baseline-specific session variants. Therefore production activation remains blocked and the current executable path is explicitly demo-only; baseline values can reject incompatible content and explain selection, but cannot legitimately alter workout doses until reviewed variants are supplied.
