# Independent GPS lifecycle and ownership review

Review date: 13 November 2026. This is a source-code and deterministic-test review. It is not physical Android GPS validation and it does not approve Metric V4 distance.

## Decision

**C — Corrections required.**

The strict timeline validator and singleton SQLite binding are useful safety improvements. They may remain while corrections are prepared. The complete lifecycle architecture is not yet approved because three executable failure paths and one authentication-state path remain unresolved:

1. `resumeTracker` checkpoints the session as `recording` before `prepareGpsResume` advances the binding generation. A failed binding write leaves the session recording while the binding remains paused.
2. `setGpsRecordingCutoff` publishes its in-memory cutoff before its transaction succeeds and does not restore the previous runtime value on failure. A failed cutoff write can leave a nominally recording session rejecting subsequent observations.
3. Expo's stable `LocationObject` carries no Torto session or binding-generation identity. A callback from an old native pipeline whose observation timestamp falls inside a replacement segment is accepted by the replacement session. Timestamp checks cannot prove native pipeline ownership in that case.
4. `AuthProvider.restore` catches an account-exit persistence failure in its outer authentication catch and clears the visible React user state. That does not provide a safe, explicit account-transition state and can leave Supabase identity, local account identity and tracker ownership out of alignment.

## Verified timeline behavior

`validateRecordingTimeline`, `strictActiveSeconds`, `activeMillisecondsAt` and `recordingSegmentAt` reject non-finite values, negative durations, overlaps/nesting, out-of-order segments and a non-final open segment. Adjacent closed/open segments remain valid. Live GPS edges and guided execution use strict active time. Historical History continues using the tolerant `activeSeconds` reader, so stored metric versions 1–3 are not reinterpreted.

A malformed timeline throws before a point or metric edge is stored. The surrounding exclusive SQLite transaction rolls back its writes. TaskManager converts a rejected batch into bounded GPS-task diagnostics. A malformed recovered guided workout can still surface an exception to its caller; there is no dedicated user-facing repair workflow.

## Active binding and transactions

Migration 23 creates one singleton row through `binding_key PRIMARY KEY CHECK(binding_key = 'active_gps')`. Owner, session, generation, lifecycle state, cutoff and update time are explicit. Generation-guarded `UPDATE` and `DELETE` statements fail closed when the expected row changed.

On the Expo SQLite adapter, GPS mutations use `withExclusiveTransactionAsync`, providing database-level serialization across foreground and headless runtimes. The JavaScript `writes` promise only serializes one runtime and must not be treated as cross-runtime locking.

The binding has no foreign key to `tracking_sessions`; stale/orphan recovery is therefore application-managed. `acquireGpsSessionBinding` clears a binding only when the referenced session is missing or terminal. Session insertion and binding acquisition are separate transactions, so start is recoverable rather than atomic as a whole.

Background batches resolve the exact binding owner and session and never choose a session by newest checkpoint. This protects against the previous cross-account recency bug. It does not solve callbacks lacking generation identity after native pipeline replacement.

## Account exit

Explicit `signOut` awaits `prepareTrackerForAccountExit` before invoking Supabase sign-out, so a persistence failure stops that explicit action. Local-data deletion also awaits tracker interruption.

Account restoration and asynchronous auth events have different failure behavior. The restore path clears the visible user in its outer catch, while an auth-event failure retains state and only sets an error. These paths need one explicit fail-closed account-transition contract. Tracker recovery must also resolve the binding's exact session, not merely the newest active row for an owner.

## Pause, Finish and native races

Pause and Finish persist a cutoff before stopping the native task and then flush known JavaScript writes. Observations after the cutoff are rejected, and observations inside pauses have no segment. Finish saves the session before clearing its binding; a failed clear leaves a stale binding that a later start may reclaim after confirming the session is terminal.

Verified only in deterministic JavaScript tests:

- queued batches in the same runtime are flushed before Finish;
- pause interiors are excluded;
- delayed ordered evidence before a cutoff can be accepted;
- duplicate and out-of-order evidence is rejected;
- failed account-exit cutoff persistence retains the binding and recording row.

Not verified and not guaranteed:

- Android delivers no callback after `stopLocationUpdatesAsync` resolves;
- headless and foreground runtimes observe native stop/start in a total order;
- a callback from an old native pipeline cannot arrive after a replacement binding starts;
- screen lock, process death and OEM battery management preserve the expected ordering.

## Metric V4 isolation

`TrackingMetricVersion` is `1 | 2 | 3`; new sessions explicitly use version 3. `movementEvidenceV4.ts` is imported only by its test. No UI, tracker, persistence, split or History path selects version 4. Existing evidence is unchanged. The stationary-scatter regression remains executable and demonstrates the prototype's unsafe false distance.

## Next distance research

The stable Expo Location API currently exposes latitude, longitude, horizontal `accuracy`, timestamp, optional `speed`, optional `heading`, and Android/iOS `mocked`. It does not expose speed accuracy or heading accuracy through the stable `LocationObject`. Expo's separate next-position type declares `speedAccuracy` and `headingAccuracy`, but adopting it would require a separate compatibility and native-behavior investigation.

The next prototype should be hybrid research, not a threshold patch:

1. Preserve raw observation values and availability flags for speed, heading, mocked status and horizontal accuracy.
2. Treat reported speed/heading only as corroborating evidence; never integrate speed alone into distance.
3. Evaluate a bounded trajectory estimator that retains curved motion rather than committing only anchor-to-point chords.
4. Estimate a stationary/noise hypothesis and a moving hypothesis over the same window. When neither dominates, report unresolved/degraded evidence rather than inventing distance.
5. Test accuracy transitions, small circles, U-turns, slow walking, stop/start behavior and conflicting speed/position evidence.
6. Establish acceptance criteria before tuning: a preregistered stationary false-motion distribution, route-distance error distribution across route shapes and speeds, pause leakage limit, and unresolved-evidence rate. Exact product tolerances require review rather than being selected to fit synthetic traces.
7. Retain conservative Metric V3 until the candidate passes synthetic, replayed Android traces and measured outdoor routes.

## Required correction order

1. Make Resume binding generation and session transition one recoverable lifecycle operation, or roll the session back to paused on any generation failure.
2. Make runtime cutoff publication transactional or token-guarded with rollback on persistence failure.
3. Define an explicit stale-native-callback containment strategy and verify it on Android before permitting rapid cross-account or cross-session pipeline replacement.
4. Introduce a fail-closed authentication transition state that cannot mix remote and local identities after tracker-interruption failure.
5. Resolve account-exit recovery from the exact active binding and add orphan cleanup without stopping another owner's task.
6. Re-run adversarial tests, then execute physical Android lifecycle tests before architecture approval.

