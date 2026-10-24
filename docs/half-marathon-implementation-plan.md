**Half-marathon planner — implementation plan for React Native, Expo, and Terra**

Prepared 22 October 2026. This is a software and product specification, not a personalized running prescription. Terra is the coding assistant in this document; a runtime AI service is not required for the first release.

**1. The first release and its success criteria**

Build this complete loop: set a half-marathon goal → receive a suitable training plan → understand today's workout → record what actually happened → review proposed adjustments → apply a revised future plan.

Start with one adult, completion-focused half-marathon pathway and one training-frequency variant. A 16-week, three-running-days-per-week variant is a proposed content brief, not a claim that every runner can prepare in that period. Its actual entry requirements, session content, length, and progression must be authored and reviewed before real training use. Being able to run 5K alone does not establish eligibility.

Support a fixed race date or a flexible distance goal. Use effort and time-based instructions initially; distance-based sessions are allowed where the reviewed template explicitly uses them. Do not infer race pace from a desired finish time.

The first release includes onboarding, a full plan preview, Today/Plan/History screens, manual logging, skipped and partial sessions, availability changes, adjustment previews, plan revisions, reminders, local data export, and deletion. Device-local means no app cloud account; it does not imply an encrypted database or absence of operating-system backups. Review platform backup behavior and avoid unnecessary sensitive data.

GPS recording, watch integrations, live roasting, open-ended coach chat, social feeds, payments, full-marathon plans, and meal planning are follow-on features. Keep the core sensei's tone warm and lightly playful, while explanations and health-related messages remain clear.

Success means a runner can complete the loop offline, understand why a change was proposed, and reopen the app without losing their plan or logs. A short beta measures usability and return after missed sessions; race-completion outcomes require following a full training cycle.

**2. What the public sources support**

Use official documentation and developer-authored store descriptions. These describe public behavior; they do not reveal the algorithms needed to clone a competitor.

| Evidence | What we learn | Our implementation choice |
|---|---|---|
| [Runna plan creation](https://support.runna.com/en/articles/15443877-how-to-create-a-training-plan-in-runna) and [current-fitness onboarding](https://support.runna.com/en/articles/15231838-how-does-runna-build-your-training-plan-around-your-current-fitness) | Recent ability, running volume, goal, and availability matter. | Collect an editable recent baseline before selecting a template. |
| [Runna training calendar](https://support.runna.com/en/articles/10137793-how-to-use-your-training-calendar) | Single-session moves are different from permanent availability changes. | Provide separate Move session and Change running days actions. |
| [Runna plan realignment](https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature), 10 September 2026 | Isolated misses differ from interruptions; fixed and flexible targets need different handling. | Maintain an interruption assessment independent of whether missed sessions were acknowledged; preview every revision. |
| [Runna temporary training reductions](https://support.runna.com/en/articles/13531498-how-to-use-not-feeling-100) | Users need a deliberate reduce/pause/return workflow. | Implement a reviewed pause/reassessment path, rather than treating illness as a scheduling problem. |
| [Runna progression safeguards](https://support.runna.com/en/articles/15279082-how-does-runna-reduce-the-risk-of-injury-and-overtraining) | Weekly volume and the longest session require separate progression checks. | Put both policies in reviewed configuration. Do not invent their private coefficients. |
| [Trenara adjustment explanation](https://www.trenara.com/blog/the-why-was-my-plan-adjusted-blog) | Actual training, pauses, and feedback inform adjustments. | Return an explanation and reason codes with every proposed change. |
| [Trenara long-run progression](https://www.trenara.com/blog/a-smarter-progression-for-your-long-runs) | Recent completed long runs matter, not just the calendar week. | Validate future long sessions against actual recent history. |
| [Trenara RPE explanation](https://www.trenara.com/blog/rpe-in-running-the-smartest-feature-you-re-probably-underusing) | Intended effort and reported effort are distinct inputs. | Save both and use the reviewed effort policy. Older Trenara RPE documentation is inconsistent; this is published behavior, not a hands-on audit. |
| [TrainAsONE developer description](https://apps.apple.com/gb/app/trainasone-ai-running-plans/id1541355896) | Available minutes and missed/off-plan sessions are relevant to replanning. | Gather time limits per day and record alternative activity. Its model formulas are not public. |

Supporting primary guidance: [NHS beginner running](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/) supports a separate introductory pathway; [CDC relative intensity](https://www.cdc.gov/physical-activity-basics/measuring/) explains perceived effort and the talk test. The [BAA half-marathon page](https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/) illustrates phased preparation but restricts reproducing or repurposing its plan. Use structural learning, not its workout table as app seed data.

All engineering choices below are proposals for this app. They are not claims about competitors' internals or evidence that our implementation reduces injury.

**3. Training content is a versioned input to the software**

Commission or obtain permission for an original half-marathon template and reviewed adaptation policy. Store these as validated structured data. A coding model must not fill missing progression numbers with plausible-looking values.

Each template needs:

- ID, semantic version, author, review state, reviewer, review date, and rights/source notes.
- Supported cohort, baseline lookback period, entry requirements, training frequency, and supported duration.
- Foundation, endurance development, race preparation, taper, and recovery phases as appropriate to its design.
- Each session's role, purpose, steps, target duration or distance, effort cues, priority, and approved alternatives.
- Recovery spacing, weekly-load constraints, long-run progression, planned lighter periods, and protected taper rules.
- Allowed schedule patterns and per-day time requirements. Include the whole session, not only its main running block.
- Gap categories and approved re-entry variants; separate illness/discomfort handling from absence caused by scheduling.
- Fixed-date feasibility checks and permitted fallbacks. Additional weeks or shorter schedules require authored variants, not silent stretching/compression.

Use `draft`, `reviewed`, and `retired` content states. Development fixtures are explicitly `demoOnly: true`; a release gate prevents them from being presented as reviewed real training. Store test-only numbers in fixtures, outside production policy.

No universal percentage rule, automatic injury-risk score, finish guarantee, or return-to-running clearance should be invented. The app can return `needs_base_build`, `goal_date_incompatible`, `needs_reassessment`, `health_hold`, or `insufficient_information` instead of forcing a schedule.

**4. Design translation from theme.webp**

The reference suggests a running editorial aesthetic: pale grey canvas, clean white panels, sharp black type, periwinkle, large pixel-like numbers, monospaced metadata, contour lines, and receipt-like training summaries. Build phone layouts from these qualities. Do not shrink the reference collage into a mobile dashboard.

Approximate proposed tokens, not exact image samples:

| Token | Value | Use |
|---|---|---|
| canvas | `#EAEAEA` | Screen background |
| surface | `#FFFFFF` | Workout, week, form, and receipt cards |
| ink | `#0C0C0D` | Main text and primary buttons |
| mutedInk | `#5E5E68` | Supporting text |
| divider | `#E1E1E5` | Thin borders and receipt separators |
| periwinkle | `#7575D8` | Large display numbers and decorative graphics |
| accentInk | `#4646A6` | Small accent text on white |
| accentWash | `#EEEEFB` | Selected and explanatory panels |
| spacing | `4, 8, 12, 16, 24, 32` | Shared spacing scale |
| radii | `6, 8, 12` | Cards/forms/sheets; avoid oversized rounded cards |

Typography: use [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) as a proposed display substitute; [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) for dates, labels, and receipt details; [Inter](https://fonts.google.com/specimen/Inter) for instructions, forms, navigation, and explanations. These are alternatives with a similar direction, not identification of the reference's original fonts. Bundle appropriately licensed files and preserve their licenses. Limit initial weights and confirm names on both platforms.

Use 48–64-point responsive display numerals, 24–28-point screen titles, 16–17-point body text, and 12–13-point utility labels. Allow text scaling. Pixel type belongs on a few short display values, never paragraphs or input fields.

Calculated contrast against white: periwinkle about 3.97:1, accentInk 7.82:1, mutedInk 6.41:1. Reserve the lighter accent for large text and graphics; do not use white small text on periwinkle. Recheck actual combinations, disabled states, and tinted surfaces in the app.

Use a black selected calendar tile with a second non-color cue, thin dividers, generous white space, subtle static contour decoration, and a restrained training receipt. Keep controls at least 48 logical units in their hit area as our product target. Preserve safe areas and keyboard visibility. Honor reduced-motion preferences. Do not copy the reference's logo, signature, photography, or mock coordinates. No fake routes, heart rate, readiness scores, or progress data.

**5. Screens and user flow**

Navigation: Today, Plan, History. Put settings and availability editing behind a profile/settings button. Use a stack for onboarding, workout details, logging, and adjustment review. No empty Coach tab in this slice.

| Screen | Required content and behavior |
|---|---|
| Welcome | Explain the half-marathon completion pathway and what data is needed. |
| Starting point | Recent weekly running, recent longest session and date, comfortable duration, training frequency, recent interruptions, and only reviewed screening questions. |
| Goal | Fixed date or flexible goal; date-only picker, start date, units. No implied guarantee. |
| Availability | Days, minute limits, preferred long-run day, known unavailable dates. |
| Eligibility | Suitable pathway or understandable unsupported-state result; show which input needs attention. |
| Plan preview | Start/end dates, phases, weekly sessions, assumptions, and activation action. |
| Today | Date strip, week/phase, today's real session or rest state, purpose, target, View workout, Log result, and Adjust options. |
| Workout detail | Warm-up/main/cool-down where specified; effort, full expected time, and approved alternatives. |
| Plan | Scrollable weekly agenda, week selector, session state, and explicit Move/Skip/Log menu. Dragging is optional later. |
| Log result | As planned / partial / different activity / did not run; actual duration, optional distance, effort, and reviewed concern flags. |
| Resolve overdue | Ask whether an unlogged session happened; allow log, partial, missed, or later. |
| Review adjustment | Before/after dates and prescriptions, reasons, target-date effect, Apply; Keep current plan only when revalidation confirms it remains compatible. |
| History | Actual activities and plan changes; compact receipt, corrections, and provenance. |
| Settings | Units, chosen training timezone, availability, reminders, export/delete, and template/version details where useful. |

Today layout example: small `HALF MARATHON / WEEK 03` utility line → compact day strip → white card with `EASY RUN` → large `35 MIN` → normal-font effort instruction → one primary action. The value is fixture content, not a prescribed workout.

Rest days show recovery as the intended action. An overdue session does not become today's workout debt. Receipt layouts display recorded facts and distinguish planned from actual values. Missing distance stays unknown, not zero; missing heart rate stays absent.

**6. Minimal technical stack**

| Concern | Choice | Reason/source |
|---|---|---|
| Foundation | Current stable Expo template + React Native + TypeScript | [Expo project setup](https://docs.expo.dev/get-started/create-a-project/) and [TypeScript](https://docs.expo.dev/guides/typescript/) |
| Navigation | Expo Router | [src/app convention](https://docs.expo.dev/router/reference/src-directory/) |
| UI | Native components + centralized StyleSheet tokens | Direct control over the reference style; no extra UI framework needed initially. |
| Storage | expo-sqlite | [Durable local database](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| Fonts | expo-font and local assets | [Official font workflow](https://docs.expo.dev/develop/user-interface/fonts/) |
| Dates | Calendar-date utilities behind one adapter; IANA timezone via supported localization APIs | Keep calendar rules out of individual screens; verify any chosen date library against its official docs. |
| Reminders | expo-notifications | [Local scheduling and cancellation](https://docs.expo.dev/versions/latest/sdk/notifications/) |
| Tests | Jest/jest-expo + React Native Testing Library | [Expo testing guide](https://docs.expo.dev/develop/unit-testing/) |
| Device builds | Expo development builds, then release-like beta builds | [Development builds](https://docs.expo.dev/develop/development-builds/introduction/) |

Do not freeze a possibly outdated SDK number in the prompt. Terra should verify current stable compatibility, record the chosen SDK, commit a lockfile, use `npx expo install` for Expo packages, and run Expo Doctor. A template offered during an SDK transition may differ from the newest documentation.

SQLite is the durable source of truth. Use ordinary React state/context for transient forms and view selection. Do not introduce a second durable store for the same plan. Use schema migrations and parameterized queries. Accepted plan changes require a transaction. Native SQLite transaction APIs and platform support should be checked against the selected SDK.

Suggested project organization:

```text
src/app/                      route entry points and layouts
src/features/onboarding/      forms and validation adapters
src/features/today/
src/features/plan/
src/features/logging/
src/features/history/
src/features/adjustments/
src/features/settings/
src/domain/training/          pure rules, types, template selection
src/domain/calendar/          date-only operations and timezone policy
src/application/              use cases coordinating engine and storage
src/data/                     SQLite schema, migrations, repositories
src/services/reminders/       notification reconciliation
src/design/                   tokens, typography, reusable primitives
assets/fonts/
assets/decorations/
content/training/             original reviewed templates and policy
tests/scenarios/              meaningful plan/adjustment fixtures
docs/                         sources, content review, handoff
```

Keep React imports, network requests, and SQLite out of the training engine. Keep progression rules out of screen components.

**7. Data contracts and durable history**

| Entity | Essential fields/responsibility |
|---|---|
| RunnerProfile | ID, units, training timezone, baseline facts/lookback dates, profile version; no unnecessary weight/sex data. |
| RaceGoal | Mode, distance, fixed race date or flexible target, start date, goal version. |
| Availability | Weekday minute limits, preferred long day, exceptions, version. |
| PlanTemplate/RuleConfig | Content and engine compatibility versions, review state, progression/spacing/re-entry policy. |
| Plan | Goal ID, template ID, active revision ID, recommendation state (`active`, `needs_review`, `health_hold`), latest validation fingerprint. |
| PlanRevision | Parent revision, engine/template/rule versions, source-input fingerprint, created timestamp, explanation. Immutable snapshot. |
| LogicalSession | Stable ID for a workout's identity across moves. |
| SessionAssignment | Logical session ID, revision ID, planned date, prescription, phase, role. Unique within its revision. |
| ActivityLog | ID, optional session link, actual date/duration/distance/effort, source, concern flags; corrections reference previous log versions. |
| SessionResolution | Explicit completed/partial/skipped decisions and reason; kept separate from the prescription. |
| AdjustmentProposal | Trigger event, base revision, input fingerprint, diff, reasons, constraints, engine version, status. |
| AuditEvent | Idempotent event ID, action type, related IDs, UTC timestamp. |
| ReminderRecord | Session/revision, local scheduled time, timezone, native notification ID, desired/current state. |

Completed facts are not rewritten by plan generation. Correction of an incorrect log appends a new version with supersession metadata; queries use the latest valid version. Historical prescriptions remain attached to the revision against which the activity occurred.

Use meters and seconds internally, independent of display preferences. Prefer integer canonical values with a documented rounding policy. Store scheduled days and race dates as `YYYY-MM-DD`, not UTC midnight. Store audit instants in UTC. Store reminder local time plus IANA timezone. Advancing a date is a calendar operation, not adding 86,400,000 milliseconds. By default the selected training timezone stays explicit; a device timezone change prompts review of reminder interpretation instead of silently moving the race date.

Overdue is a derived UI condition for a past unlogged assignment. It is not proof of a missed run. Keep resolved skipped sessions in interruption analysis; pressing Skip must not hide training absence.

After any new fact, revalidate actionable future recommendations immediately. An immutable active revision may still exist while its recommendations become `needs_review` or `health_hold`. Preserve that schedule for inspection, but suppress incompatible workout actions and reminders until reviewed. While validation is incomplete, show a check-in/review action rather than recommending the old workout. Dismissing a proposal must not reactivate an incompatible schedule. A health hold uses the reviewed reassessment/return workflow.

**8. Plan generation and adaptation contract**

Core functions should be pure and accept an injected clock/context:

```ts
validateProfile(input, policy)
selectTemplate(profile, goal, availableTemplates)
generatePlan(profile, goal, availability, template, policy, context)
validatePlanConstraints(candidate, history, policy)
proposeAdjustment(snapshot, triggerEvent, policy, context)
describeProposal(proposal, locale)
```

IDs and timestamps should be supplied or deterministically derived so identical inputs and versions produce equivalent prescriptions. Persisted activation is an application-layer action, not a side effect of generation.

Generation order: validate required data → select a compatible reviewed template → check entry requirements → place its sessions against availability → check the whole plan, weekly volume, independent longest-session progression, spacing, and taper → return a preview or explicit infeasibility result. No silent switch to a different goal or training frequency.

The scheduler can be bounded and simple: generate the permitted weekly patterns from the template, filter invalid patterns, and select a stable valid arrangement favoring the preferred long day and minimal change. Do not start with an opaque optimizer. When no pattern works, show which constraint failed and request an availability/goal change.

Proposal precedence: health hold/explicit pause → fixed race and taper constraints → recent demonstrated baseline → reviewed progression/spacing policy → availability → smallest useful schedule change. Extra activity may reduce upcoming demand; it must not automatically justify harder progression.

| Trigger | First-release behavior | Important constraint |
|---|---|---|
| Unlogged past session | Ask whether it happened. | No automatic skip, roast, or fitness deduction. |
| One ordinary run explicitly missed | Default proposal drops it; offer Move only if valid. | No mileage repayment or session stacking. |
| Long run missed | Check subsequent long sessions using actual recent history and the reviewed progression policy. | Do not advance as if the missed long run occurred. |
| Partial completion | Record actual work and effort; assess consequences using reviewed rules. | No binary assumption that all or none of the load occurred. |
| Different/extra workout | Log it separately and offer an explicit session match only where appropriate. | No automatic credit toward unrelated prescriptions. |
| A sustained interruption | Ask reason/current capacity; choose an approved re-entry variant. | Gap boundaries come from reviewed configuration. |
| Several weeks away | Reassess rather than resume the old calendar week automatically. | Fixed-date feasibility is checked again. |
| Illness/discomfort | Pause progression and show the reviewed support/reassessment pathway. | No diagnosis, clearance, or humor about the concern. |
| Reduced availability | Find a valid schedule or explicitly supported alternative variant. | Do not create a three-day plan by deleting a day from an unrelated four-day template. |
| Absence near race day | Preserve protected taper and reassess the goal. | No late catch-up long run. |
| Race date changed | Preview a rebuilt future schedule; preserve completed history. | Never shift recorded activities. |

Example of logic, not a training prescription: a fixture has runs Tuesday, Thursday, and Sunday. Thursday is explicitly missed. A Saturday make-up would break that fixture's reviewed spacing rule before Sunday's long run. The proposal drops Thursday, keeps valid remaining sessions, explains why, and applies only when accepted. If Sunday is missed instead, the next long-run prescription must be reassessed, not advanced blindly.

Apply workflow: event → latest snapshot → pure proposal → constraint results → before/after preview → runner accepts → verify base revision and input fingerprint → atomically append new revision and update active pointer → reconcile reminders.

Logging an event does not require acceptance of a proposed schedule, but it does immediately invalidate stale recommendation validation and suppress affected reminders. Offer Keep current plan only if that existing future schedule passes the latest constraints; otherwise offer Review options or Pause instead. Never interpret cancelling a preview as clearance to resume progression.

Changing a log, availability, concern flag, or race date makes an old proposal stale even if its plan revision ID did not change. Reject stale application and refresh the preview. Duplicate event IDs and repeated Apply taps return the existing result. Keep completed history fixed. Undo creates a new validated revision of future assignments; it never rolls back recorded facts. If subsequent actions invalidate an immediate undo, offer a freshly evaluated compensating change.

**9. Small implementation phases**

Implement one phase at a time. Each phase should produce a demonstrable result and a small reviewable change. Do not estimate the whole build by assuming each phase takes one day.

| Phase | Outcome | Main dependency |
|---|---|---|
| 0 | Source-backed product/content contract | This document and official sources |
| 1 | Working Expo foundation | Scope fixed |
| 2 | Reference-inspired component system | Foundation |
| 3 | Persistent domain and revision model | Contracts |
| 4 | Onboarding and feasibility states | Components and storage |
| 5 | Deterministic initial plan engine | Template/policy contract |
| 6 | Today, Plan, and workout detail | Generated plan |
| 7 | Actual logging and overdue resolution | Durable sessions |
| 8 | Missed-session adjustment proposals | Actual history and engine |
| 9 | Apply, move, edit, and undo | Proposal validation |
| 10 | Reminders and data controls | Stable revisions |
| 11 | Device QA and small beta | Complete loop |

**Phase 0 — product, source, and training contract**

Tasks: save source links with retrieval dates and concise findings; define the supported cohort and one frequency variant; define each input and every unsupported state; write the adjustment decision table; define original template/rule schemas and review metadata; create development-only fixtures with explicit provenance.

Deliverables: `docs/product-contract.md`, `docs/source-register.md`, `docs/training-policy.md`, and scenario fixtures. This phase does not require pretending the original coaching content already exists. Record content-author/reviewer work as a release dependency, while allowing UI and software work with demo fixtures.

Done when every training number has an explicit origin/review state, the fixed/flexible goal difference is documented, and no production pathway silently falls back to unreviewed content.

**Phase 1 — Expo foundation**

Tasks: select and record a current stable Expo/React Native/Router stack; enable strict TypeScript; create the route shell and domain directories; configure lint, type checking, and Jest; establish development build instructions for Android and iOS; preserve a lockfile.

Deliverable: a bootable app with Today/Plan/History placeholders, not a generated training plan.

Done when the app launches on the available target device/emulator, routes work, type/lint checks pass, and one meaningful domain test runs. Record untested platforms honestly. No sign-in or AI SDK needed.

**Phase 2 — design system and visual shell**

Tasks: implement shared color, spacing, radius, and typography tokens; bundle fonts and licenses; build Screen, Card, Text, Button, Field, DayStrip, SessionRow, StatusLabel, and TrainingReceipt primitives; produce fixture-driven Today/Plan/History/detail layouts; show loading, empty, rest, and error states.

Done when the interface resembles the reference's visual language on a narrow phone, display type is restrained, selected days have text/shape cues, large text remains usable, and no fake metrics appear. Inspect screenshots on both platforms when available. Decorative graphics must not cover controls or accessibility reading order.

**Phase 3 — storage and domain contracts**

Tasks: implement the entities above, SQLite migrations, repositories, transactions, input fingerprints, and event IDs; persist a sample revision and activity history; add a shared date/unit adapter; use a clock injected into domain tests.

Done when relaunch preserves data, migration tests retain a preexisting plan, failed revision writes leave the active pointer intact, and date/unit round trips work. Separate production/demo data and prevent accidental mixing.

**Phase 4 — onboarding and eligibility**

Tasks: build baseline, goal, availability/minutes, units/timezone, and reviewed screening forms; persist drafts; show editable assumptions and all eligibility outcomes; require a compatible template for real-plan activation.

Done when back navigation preserves inputs, invalid/impossible dates have explanations, unavailable long-run days are caught, and unsupported beginners are offered an appropriate pathway message instead of fabricated half-marathon workouts. Optional recent timed efforts must not trigger a forced maximal test.

**Phase 5 — deterministic initial planning**

Tasks: implement template validation/selection, bounded scheduling, phase placement, constraint checks, and plan preview/activation; keep numerical policy in versioned content; expose feasibility reason codes.

Done when the same inputs generate equivalent sessions, all assignments fit time limits, race/taper positions are valid, incompatible dates are rejected, and production cannot activate a demo template. Use synthetic policy fixtures for engine testing; use the reviewed original content for a real-training release.

**Phase 6 — daily and weekly execution screens**

Tasks: connect Today, Plan, and workout detail to persisted assignments; show today's action, purposes, full steps, effort cues, phases, and upcoming weeks; support rest-day and no-active-plan states.

Done when changing the selected date shows the right session without shifting actual dates, units convert only for display, and the app works without a network connection. Screen readers should announce a meaningful phrase such as “Easy run, 35 minutes, scheduled Thursday,” using actual session values.

**Phase 7 — manual logs and unresolved sessions**

Tasks: implement complete/partial/different/missed workflows; record actual duration, optional distance, effort, and reviewed flags; allow past-date logging and corrections; build history/receipt; derive overdue entries and ask for confirmation.

Done when partial work is retained, unknowns stay unknown, duplicate submissions do not duplicate activity, corrections preserve audit history, and skipped acknowledgments remain visible to interruption analysis. Save actual logs before generating any adjustment so a failed proposal cannot erase a run. Revalidate recommendation eligibility immediately after a new fact; while rules cannot confirm it, show a review state rather than the previous workout as actionable.

**Phase 8 — explainable adjustment proposals**

Tasks: implement the event-driven decision table, gap assessment, separate long-run and weekly checks, constraints, reason codes, no-change outcomes, and explicit infeasibility. Build the before/after preview, including future-date and target effects.

Done when isolated easy misses, long-run misses, repeated skips, partial sessions, off-plan activity, near-race misses, reduced availability, and health holds all have tested behavior. No rejected proposal changes the active plan revision, but new facts can put recommendations on hold. Keeping the existing schedule requires a fresh valid result. No LLM is consulted for prescriptions.

**Phase 9 — revision application, scheduling edits, and undo**

Tasks: implement atomic acceptance, stale-input rejection, duplicate-action idempotence, single-session moves, permanent availability/race edits, history of changes, and validated compensating undo. Include a visible Apply state and disable repeated submission while in progress.

Done when an outdated preview cannot overwrite a newer log or plan; completed facts remain unchanged; invalid moves are blocked with useful reasons; rollback/failure cannot produce a half-applied plan; and sequential edits lead to one consistent active revision.

**Phase 10 — reminders and data controls**

Tasks: request notification permission only when reminders are enabled; schedule a rolling near-term horizon; persist native IDs; cancel/replace obsolete reminders after changes and completion; suppress incompatible reminders as soon as new facts create `needs_review` or `health_hold`, even before a replacement revision is accepted; reconcile on foreground/timezone changes; open the correct current session or review state from a reminder. Add versioned JSON export and explicit local-data deletion.

Done when denial does not block planning, old reminders disappear after a session moves, duplicate reconciliation does not duplicate reminders, exports distinguish planned/actual/revision data, and deletion clears app-owned data and reminders. Import is a separate feature unless schema validation and conflict handling are explicitly implemented. Notification delivery is best effort, never a source of truth for missed-session status.

**Phase 11 — regression, device QA, and beta**

Tasks: run the scenario matrix below; test offline relaunch and release-like builds, VoiceOver/TalkBack, text scaling, keyboard/safe areas, permission denial, and date boundaries; obtain training-content/policy review before real training; distribute a small beta through suitable platform channels.

Done when one person can onboard, activate a suitable plan, log partial/completed/missed work, review/apply a valid revision, reopen offline, and understand history. Observe whether users understand changes and can return after a lapse. Do not claim improved race completion from a short usability pilot.

**10. Verification matrix**

| Scenario | Required result |
|---|---|
| Same inputs and versions | Same prescriptions and stable ordering. |
| Race too soon | Explicit incompatibility; no compressed taper. |
| No approved content | Clearly labelled demo or blocked real activation. |
| Missed ordinary session | No repayment mileage or duplicated workout. |
| Missed long session | Future long progression uses actual history. |
| Many acknowledged skips | Interruption reassessment remains possible. |
| Unlogged past session | Confirmation request, not assumed absence. |
| Partial/different activity | Actual work retained; no fabricated completion. |
| Illness/discomfort flag | Progression hold/review path; no joking pressure. |
| Active schedule invalidated by new facts | Retain it for inspection; suppress incompatible recommendations/reminders. Dismissing a preview does not restore them. |
| Availability minutes too short | Supported alternative or infeasible result. |
| Proposed move violates spacing | Cannot apply it through an alternate UI path. |
| New log while preview open | Preview becomes stale and is refreshed. |
| Apply tapped twice | One accepted change, not two revisions. |
| Transaction or migration failure | Historical data and active revision preserved. |
| Undo after another log | Preserve that log; validate a new future revision. |
| DST/travel/month boundary | Race and assignment dates remain correct. |
| km/mile switch | Canonical prescription/actual values unchanged. |
| Reminders denied/offline | Core planner remains usable. |
| Session moved/completed | Obsolete reminder cancelled/reconciled. |
| Local export/delete | Expected data exported; app-owned data/reminders cleared. |

Prefer scenario-based domain tests and a small set of interaction/integration tests. Do not spend the first release snapshot-testing every visual detail. Distinguish automated checks from manual device checks in the implementation report.

**11. Later additions without rebuilding the core**

After the planning loop works, add one capability at a time: direct activity recording/import, authenticated backup/sync, optional AI explanations/persona, structured strength/fueling modules, full-marathon variants, then community and payments.

A later AI service receives only permitted facts and the engine's selected decision. It may explain or add approved tone; it cannot change prescriptions. Keep provider secrets on a server: [Expo public environment variables are visible in the bundle](https://docs.expo.dev/guides/environment-variables/). Do not assume Terra is a runtime model/API requirement.

A future backend needs user isolation, an outbox, idempotency, row revisions, and explicit plan-conflict handling; adding a hosted database does not automatically synchronize SQLite. Review integration permissions before relying on device/platform data. In particular, [Strava's standard API policy](https://www.strava.com/legal/api_policy) currently restricts using API data in AI applications, including model context; the existence of another app is not permission for our integration.

Use the companion Terra prompt file to implement these phases sequentially. Each phase should end with the changed files, the behavior now available, verification performed, limitations, and the next dependency.
