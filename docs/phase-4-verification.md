# Phase 4 verification record

Phase 4 adds device-local onboarding drafts and eligibility messaging only. It does not create, preview, or activate a real training schedule.

## Delivered

- The persisted `onboarding_drafts` migration stores exactly the baseline, goal, availability, display-unit, timezone, and reviewed-screening inputs consumed by `assessEligibility`.
- Baseline, goal, availability, and review routes save each edit to SQLite. Navigation returns to previous routes without discarding the draft; reopening reads the stored `current` draft.
- Eligibility remains a pure domain function and returns `eligible`, `insufficient_information`, `needs_base_build`, `goal_date_incompatible`, `needs_reassessment`, or `health_hold` with explanatory field references.
- The only eligible result is explicitly demo-only. A 5K is neither collected as a standalone readiness proof nor used to infer one; no maximal test is requested.

## Checks

The automated suite covers draft persistence/reopen, missing baselines, invalid dates, fixed-date ordering, incompatible long-run preference, zero minute limits, base-build, reassessment, health-hold, and labelled demo eligibility. Device interaction and SQLite execution remain untested on a physical device/emulator.
