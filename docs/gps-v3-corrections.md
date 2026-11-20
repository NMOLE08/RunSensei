# GPS reliability corrections for independent re-review

Implementation date: 12 November 2026. Synthetic verification only; Android field accuracy remains unverified.

## Version boundary

New recordings use metric version 3. Stored version-1 and version-2 activities, distances, edges and splits are not recalculated. Version 3 identifies two corrected semantics: observation-time active-position clipping and independent valid-observation continuity. Migration 22 is additive: it stores the last valid observation timestamp and adds an active-time edge index.

## Active time

For evaluation time `t`, each segment contributes:

`max(0, min(segment.end ?? t, t) - segment.start)`

Segments beginning at or after `t` contribute zero. Pauses contribute zero. Delayed accepted observations therefore retain the active-time position they had when captured, independent of callback processing time. Append-only ordering rejects evidence older than committed evidence rather than rewriting a completed split.

## Observation and movement model

- `lastValidObservationTimestampMs` proves continuity of valid, in-order fixes.
- `lastPoint` is the accepted distance anchor. Jitter does not move it.
- persisted metric edges are committed movement/anchor/gap evidence.
- GPS state separately stores received, valid and accepted timestamps.

An observation gap is now measured between valid observations, not from the older movement anchor. Credible displacement can accumulate against the anchor until it exceeds `max(5m, 2*hypot(anchorAccuracy,currentAccuracy))`. This preserves stationary jitter suppression while preventing frequent uncertain walking observations from being repeatedly reset at 30 seconds. It remains intentionally conservative: short out-and-back movement inside the uncertainty radius is indistinguishable from stationary oscillation, and curved routes are approximated by accepted chords.

## Lifecycle

Pause and Finish publish an in-process cutoff immediately and persist it through the serialized SQLite queue. Points after that user-action timestamp are rejected. A late pre-cutoff point can still append to a paused/finishing session when it is in segment, in order and cannot rewrite committed evidence. Unsafe older evidence remains rejected with a persisted reason.

Interruption text now states that recording stopped when Torto detected the issue and that intervening coverage may be incomplete. Resume pipeline failures persist an owner-scoped diagnostic that survives reload. The pre-start readiness fix is submitted only to the normal observation-time membership check; a fix captured before the session start is not fabricated into the recorded route.

## Incremental processing

Previously, every callback loaded and replayed every route point and every edge: cumulative work grew approximately with the square of accepted observations. Version 3 loads the latest persisted point as its distance anchor and stores valid-observation continuity separately. Split processing loads only evidence from the last completed kilometre crossing. The live snapshot uses the same bounded partial-kilometre evidence. Full historical replay is retained only in explicit repository reads used for audit/export.

Work per ordinary batch is now proportional to the new batch plus the current unfinished kilometre's accepted edges. Memory use is bounded by those query results. This is an algorithmic complexity result; phone latency and battery usage require physical measurement.

The deterministic long-session test seeds 5,000 historical route points and verifies that the ordinary callback requests a single latest anchor (`ORDER BY timestamp_ms DESC LIMIT 1`) and appends one new point. It does not claim Android latency or battery performance.

## Re-review focus

Both previously expected-failure assertions are ordinary passing tests. Re-review should inspect `activeSeconds`, `acceptTrackPoint`, `persistLocationBatch`, migration 22, incremental split derivation and session lifecycle diagnostics. Physical acceptance must still cover stationary drift, slow walking, a measured kilometre, curves/turns, pause movement, screen lock, app switch, weak-signal recovery, permission revocation, Finish, restart and History comparison.

Automated verification: TypeScript passed; ESLint reported zero errors and two pre-existing array-style warnings; focused GPS verification passed 5 suites / 49 tests; full Jest passed 118 suites / 689 tests. The main and three foundation policy validators passed. Gradle was not run.
