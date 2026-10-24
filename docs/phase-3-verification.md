# Phase 3 verification record

Phase 3 adds one durable source of truth: SQLite through `expo-sqlite`. The domain layer remains pure TypeScript; route and visual-state code do not own a competing persistent plan store.

## Design

- `src/domain/training/entities.ts` defines all requested durable entities and preserves planned assignments separately from versioned activity logs.
- `src/data/migrations.ts` has ordered, idempotent migrations tracked in `schema_migrations`.
- `TrainingRepository` uses positional parameter binding exclusively. `applyRevision` is the explicit transaction boundary: revision, assignments, active-plan pointer, and audit event either all persist or all roll back.
- Calendar values remain `YYYY-MM-DD`; audit values are UTC instants; meters and seconds remain canonical integers; missing distance is SQL `NULL`.
- A real plan rejects a `demo:` template identifier. This is a storage-layer guard, complementary to later template review validation.

## Checks

Automated tests cover reopening a persisted sample plan, rerunning migrations without losing it, an injected revision-write failure and rollback, null distance, demo isolation, date/unit round trips, and stable fingerprints. Device SQLite execution remains for the Android/device QA phase; no cloud synchronization was added.
