# Phase 8 verification record

## Pure adjustment proposals

`proposeAdjustment` is a pure domain function. It receives the active snapshot, recorded facts, explicit resolutions, current availability, goal, policy, and date. It never writes SQLite or changes the active revision.

Its precedence is: reviewed health hold; unresolved past work; fixed-date feasibility; acknowledged interruption; availability; protected taper; actual recent long-run evidence; then the smallest safe future change. It returns a preview, explicit no-change, or unsupported/review result with reason codes, constraints, explanation, target-date effect, and an input fingerprint.

The bounded adjustment can only lower a remaining long-run target to the reviewed maximum relative to actual completed/partial long-run history. It never creates a catch-up session, credits unlogged/different activity, advances readiness because a week elapsed, or rewrites a prescription automatically.

## Preview behavior

`AdjustmentPreview` shows before/after dates and targets, reasons, constraints, explanation, goal effect, and whether Keep current plan passed revalidation. Unsupported states direct the runner to review or pause. No acceptance/apply control exists in Phase 8.

## Validation run

On 2026-10-24, TypeScript, ESLint, and Jest passed. Scenario tests cover ordinary misses, long-run misses, partial work, different activity, unlogged assignments, interruptions, availability reduction, fixed-date infeasibility, protected taper, and health holds.

No emulator or simulator was launched. The active revision remains unchanged until the Phase 9 acceptance workflow.
