# Phase 9 verification record

- `applyAdjustment` accepts only a validated proposal, derives a deterministic revision ID, and delegates one atomic active-pointer update to `applyValidatedRevision`.
- The transaction checks the active base revision and stored validation fingerprint before inserting the immutable revision and assignments. A duplicate Apply returns the existing result without a second revision.
- Stale previews return a refresh error. `keepCurrentPlan` is available only when the current recommendation remains `active` and the revalidated proposal fingerprint still matches.
- One-session moves and race-date rebuilds are pure proposal helpers; they operate only on future assignments. Permanent availability is evaluated through the adjustment pipeline, not a screen bypass.
- Historical facts and assignments are never relocated. `undoAsNewRevision` deliberately requires a newly revalidated future-only proposal against the current logs; it is not a database rollback and therefore retains subsequent activity.

Automated coverage includes duplicate Apply, stale input, transactional failure, invalid move, and preserved historical assignments. No emulator or device was used.
