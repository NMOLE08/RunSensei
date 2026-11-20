# Rolling seven-day planner progress

Last updated: 2026-10-31

This file tracks implementation against `RunSensei_Rolling_Weekly_Planner_Terra_Spec.md`. Passing technical checks do not make synthetic workout content reviewed coaching advice.

## Phase checklist

- [x] Phase 0 — current checkout audited and contracts updated.
- [x] Phase 1 — five-stage onboarding, versioned draft migration, first-seven-day demo preview, and focused tests.
- [ ] Phase 2 — native-only baseline analytics and strict model-input provenance allowlist.
- [ ] Phase 3 — reviewed rolling policy framework and 2–6-day reviewed frequency variants. Technical one-week demo generation exists, but reviewed production content does not.
- [ ] Phase 4 — actual-device Qwen/`llama.rn` compatibility and performance verification.
- [ ] Phase 5 — constrained Qwen orchestration over approved candidate IDs.
- [ ] Phase 6 — normalized seven-day window/rest-day persistence and atomic acceptance.
- [ ] Phase 7 — weekly feedback dialogue and future-only review flow extensions.
- [ ] Phase 8 — end-of-week freeze and idempotent next-week handoff.
- [ ] Phase 9 — full device/release verification.

## Phase 0 evidence

Verified stack from `package.json`: Expo `~58.0.17`, React Native `0.88.0`, Expo Router `~58.0.25`, TypeScript `~6.0.3`, Expo SQLite `~58.0.13`, Supabase JS `^2.118.0`, Expo Location `~58.0.19`, and `llama.rn` `0.13.0-rc.6`.

Reusable paths:

- Draft autosave: `src/features/onboarding/useOnboardingDraft.ts`, `src/application/onboardingDrafts.ts`, `src/data/onboardingDraftRepository.ts`.
- Deterministic content and constraints: `src/domain/training/content.ts`, `src/domain/training/engine.ts`, `src/domain/training/structuredContent.ts`.
- Immutable plan/activity storage: `src/data/repositories.ts`, `src/data/migrations.ts`.
- Outcome/review/revision flow: `src/application/recordSessionOutcome.ts`, `src/application/planReview.ts`, `src/application/applyAdjustment.ts`.
- Offline tracker: `src/domain/tracking`, `src/application/tracking`, and training routes under `src/app/training`.
- On-device model boundary: `src/ai`, including a validated weekly-plan schema and model installation records.

Verified gaps:

- `docs/training-policy.md` confirms there is no reviewed production template or numerical policy.
- Existing demo activation generated a full authored sequence; it did not satisfy rolling seven-day generation.
- The old onboarding route stored only a summary baseline and hid real availability behind a development helper.
- Existing server weekly-planner prototypes and local Qwen scaffolding are not a verified production model workflow.
- No normalized accepted `training_weeks`/seven explicit day rows exist yet; that remains Phase 6.
- No physical Android or iOS verification was performed in this phase.

Baseline checks before edits: TypeScript passed, lint passed, and Jest passed 31 suites / 120 tests.

## Phase 1 evidence

Implemented:

- Five saved stages: goal, current fitness, actual schedule, preferences, and first-week preview.
- Current performance/baseline facts remain separate from aspirational target performance.
- Four source-tagged baseline week records preserve unknown values rather than converting them to zero.
- Actual 0-based Monday-first weekday availability, per-day whole-session limits, long-run preference, busy dates, timezone, units, access, and optional caps are saved.
- Health concern and sustained interruption branches still take precedence.
- Unsupported goals and unsupported frequencies return explicit states; a marathon or start-running goal is never mapped to half-marathon content.
- Draft schema version 3 is additively migrated. Legacy JSON fields are retained and new fields receive safe explicit defaults.
- A distinct pure `generateWeeklyDemoPlan` creates only the first consecutive seven-day window. It does not call the legacy full-plan generator or create future sessions.
- Preview renders all seven dates; unassigned dates are explicit rest days. Activation saves only the three workout assignments from the accepted fixture window and records `futureWeeksGenerated: false` in revision metadata.
- Demo labels remain visible and production activation remains unavailable.

Focused verification after edits:

```text
pnpm exec tsc --noEmit
PASS

pnpm exec jest tests/domain/onboardingEligibility.test.ts tests/domain/flexibleDemoScheduling.test.ts tests/domain/trainingEngine.test.ts tests/data/onboardingDraftRepository.test.ts tests/data/onboardingMigrationRepair.test.ts --runInBand
Test Suites: 5 passed, 5 total
Tests:       28 passed, 28 total
```

Full repository verification after edits:

```text
pnpm run typecheck: passed
pnpm run lint: passed
pnpm run test: 30 suites passed, 127 tests passed
pnpm run doctor: 18/20 checks passed; command exited 1
```

Expo Doctor findings are pre-existing project maintenance items, not hidden passes: native `android`/`ios` folders coexist with app-config fields that will not sync unless the project deliberately runs Prebuild, and 13 SDK 58 dependencies have newer expected patch versions. No dependency or native-project regeneration was performed during this TypeScript/SQLite phase.

Acceptance evidence:

- Autosave/reopen: repository save/reload test.
- Legacy migration: old draft upgrade test plus SQLite column-preservation test.
- Blank/invalid values: eligibility tests for missing baseline, invalid dates, timezone and explicit confirmation.
- Goal safety: unsupported-goal test prevents silent substitution.
- Availability: incompatible frequency, pattern, long day, and time limit tests.
- Calendar scope: rolling generator test asserts every workout is inside the single seven-day window and output is deterministic.
- Long-term date: fixed date is retained as context; it is not compressed to the current week.

## Content and rollout status

- Runnable content: synthetic 5K, 10K, and half-marathon three-day demo fixtures only.
- Production content: blocked pending independently authored and qualified-reviewer-approved templates and numerical policy.
- Strava: excluded from analytics/model input pending explicit provider authorization for the proposed use.
- Native rebuild: Phase 1 changes TypeScript and SQLite schema only; Metro reload is sufficient for an already compatible development build. A release build is still needed before distributing an APK. Existing installations migrate in place; do not clear app data.
