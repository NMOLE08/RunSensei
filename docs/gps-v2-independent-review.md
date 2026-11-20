# Independent GPS v2 review — 12 November 2026

**Decision: C — CORRECTIONS REQUIRED before the live-metrics UI handoff.**

This is a source review and deterministic verification, not an Android accuracy certification. Only this report and independent tests were added. No production filter, persistence, UI, policy, signing or user data was changed. No Gradle build or physical-device test was performed.

## Blocking findings

### R1 — Incorrect active time for delayed observations (reproduced, high priority)

`src/domain/tracking/session.ts`, `activeMillisecondsAt` delegates to `activeSeconds`. Closed segments contribute their entire duration regardless of the observation time. `src/application/backgroundGpsTask.ts::persistLocationBatch` stores this value in each metric edge.

Reproduction: segments [0,10000], [20000,30000], [40000,open], observation at 5000 ms. Actual result: **20000 ms**. Correct cumulative active time at that observation: **5000 ms**. A delayed sample in a closed segment can therefore have an inflated time even though its distance and segment membership are valid. Split interpolation can permanently store an incorrect split because inserts deliberately do not overwrite existing splits.

Required correction: calculate the intersection of every recording segment with time up to the observation, excluding future segments. Preserve finalized historical v1 values. Add service-level delayed-before-pause/after-resume tests that verify stored edge times and split durations, not just distance.

### R2 — Continuous slow movement can record zero distance (reproduced, high priority)

`src/domain/tracking/metrics.ts::acceptTrackPoint` applies the 30-second gap rule to time since the last **accepted anchor**, not the last valid observed fix. Rejected jitter does not move that anchor, which is appropriate for displacement accumulation, but the gap rule subsequently discards that accumulated movement.

At reported accuracy 20 m for both points, the acceptance threshold is `2 * sqrt(20² + 20²) = 56.57 m`. A straight 1 m/s walk cannot cross it within 30 seconds. The next fix resets the anchor with zero distance. Independent test: **120 m walked, fixes every 2 seconds, recorded distance 0 m**. At 3 m accuracy the same walk records 120 m.

Required correction: separate observation continuity from accepted movement-anchor age, and design/test how unresolved movement is retained without inferring distance through a true observation outage. Do not simply lower thresholds until tests pass. Preserve uncertainty and measure the trade-off outdoors.

### R3 — Interruption cutoff contradicts its explanation (source-confirmed)

`src/application/workoutTracker.ts::markRecordingInterrupted` closes the segment at `Date.now()`. Its caller, `handleTrackerAppStateChange`, tells the user recording stopped at the last saved checkpoint. These can be substantially different. The existing permission-revocation test uses the same time for the checkpoint and detection, so it cannot distinguish them.

Required correction: explicitly choose and document the evidence-supported interruption cutoff, distinguish unknown downtime from active recording, and make messaging agree. Test detection well after the last checkpoint. Process-restart recovery separately closes at the persisted checkpoint; these paths currently have different semantics.

## Other verified limitations and unresolved risks

| Finding | Evidence and impact | Required follow-up |
|---|---|---|
| Valid late tail samples are dropped after Pause/Finish | `persistLocationBatch` only selects a session in `recording` state. Once paused/saved, a subsequently delivered sample before the cutoff cannot be attached. Queue flushing only drains known queued work. | Specify a safe native-delivery drain boundary; test late pre-cutoff callbacks and reject post-cutoff movement. Do not promise lossless tail capture yet. |
| Resume quality failure is not durably stored | `resumeTracker` sets in-memory `unavailable`, but `checkpoint` writes the session, not GPS state; `prepareGpsResume` already persisted `acquiring`. Reload can lose the failure explanation. | Persist the appropriate quality/error state with the failed resume; test reload. |
| Acquiring has no timeout in the shared selector | `application/liveRunMetrics.ts` exempts acquiring from stale conversion. The tracker can show a weak-GPS message while the contract remains acquiring. | Define and test no-fix behavior; keep permission state distinct from signal evidence. |
| Active v1 rolling pace becomes unavailable | `selectLiveRunMetrics` uses no edges for v1 and always returns null rolling pace; the old track has rolling samples. | Explicitly accept/document this restriction or provide a version-correct legacy fallback. Do not recompute historical v1 distances/splits. |
| Incomplete beginning/resume coverage may be labelled continuous | Split coverage changes only on `edge.kind === 'gap'`; elapsed time before an initial anchor is not flagged. | Define coverage for acquisition delay and resume gaps and test it. |
| All-history processing grows throughout a run | Every batch loads/replays all route points, loads/sorts all edges, and attempts every prior split insert; snapshot reload also loads all edges. Shared rolling pace copies/sorts that list every UI evaluation. | Bound live windows and incrementally derive new splits while retaining the durable ledger. Current total work is approximately quadratic across a run. No device slowdown has been measured. |
| Initial acquired fix commonly predates the new segment | `startTracker` obtains the fix before creating the session, then submits it to timestamp membership validation. Such a fix is rejected for that new segment. | Test nonzero acquisition-to-start delay. Treat it as pre-start readiness evidence, not a persisted session anchor or proof of recorded distance. |

**Concurrency risks not reproduced on native Android:** the JS write queue only coordinates one runtime. Batch writes use exclusive native transactions, but lifecycle checkpoints use regular transactions. Snapshot reads of session/edges/splits/quality are separate queries and may straddle a batch commit. A pending/in-flight batch can precede the queued cutoff write. Future-tolerated GPS timestamps make that boundary especially important. Require real SQLite concurrency tests and controlled cutoff-race tests before claiming complete atomic lifecycle guarantees. No account leakage was reproduced.

## Filter mathematics and consequences

The filter uses Haversine distance with radius 6,371,000 m, rejects invalid coordinates/timestamps/accuracy, permits accuracy up to 50 m, rejects speed above 12 m/s, and anchors without distance after a gap above 30 seconds. V2 removes the old processing-age rejection; observation order is still enforced.

The uncertainty multiplier is an engineering heuristic. Reported accuracy is not a guaranteed error bound, and multiplying the combined radii does not establish a statistical confidence level.

- **Stationary oscillation:** the reproduced alternating 8 m/3 m-accuracy trace is suppressed. Larger plausible drift can still cross the threshold; physical performance is unknown.
- **Short steps/high-frequency fixes:** retaining the movement anchor allows small straight displacements to accumulate at good accuracy. The new 2 m/update test demonstrates this. R2 prevents this at larger uncertainty.
- **Run/walk beginners:** walking and short intervals are particularly exposed to R2 and unfinished displacement chunks. Their pace can remain unavailable even with frequent valid samples.
- **Normal running:** at 3 m accuracy the threshold is about 8.49 m; at 20 m it is 56.57 m; at 50 m it is 141.42 m. A runner must exceed roughly threshold/30 seconds before the current gap logic resets. These are mathematical consequences, not recommended speeds.
- **Curves:** accepted chord distances are shorter than travelled arcs. The independent repeated-circle trace undercounts by more than 4%; this synthetic geometry is not a field accuracy estimate.
- **Turns/out-and-back:** moving 8 m away then back at reported 3 m accuracy records zero. This trace is indistinguishable from the stationary oscillation being suppressed. No universal filter can guarantee both interpretations from identical inputs.
- **Poor accuracy/recovery:** above 50 m is rejected. A poor accepted anchor can delay good-fix recovery because both radii enter the threshold. A true long outage must re-anchor without invented distance; current code also creates false outages after jitter rejection.

## Pause, delayed delivery and ownership

`recordingSegmentAt` uses inclusive start/end observation boundaries. Batches sort by observation time, reject paused timestamps, reject already-committed/out-of-order timestamps, and reset the anchor across recording segments. Duplicate identity is session/timestamp; conflicting coordinates are rejected. Global timestamp ordering intentionally refuses delayed earlier evidence once later evidence is committed, avoiding historical metric rewrites.

Pause/Finish capture the action timestamp before stopping collection. Resume retains the session ID and adds a segment. AppState backgrounding does not pause. Background processing resolves a persisted recording, without React login state. Foreground snapshot reads and History are owner-scoped. The background selector relies on a single-active-recording invariant; it is not an account-specific lookup and must remain consistent with logout/account-switch behavior.

Existing mocked service tests exercise ordinary duplicate batches, pause/resume, delayed data, screen-state transitions, retry and recovery. They do not establish OS delivery, multiple-runtime ordering or native rollback guarantees.

## Pace and splits

Overall pace is `activeSeconds * 1000 / distanceMeters`, seconds/km, null for unknown/zero distance or nonpositive active time. At finalized session time, closed segments correctly exclude pauses. R1 concerns earlier observation times, not the normal final sum. Small accepted distances produce volatile averages; no medical interpretation is implied.

Rolling pace is `deltaObservationSeconds * 1000 / deltaAcceptedDistance`, using current-segment edges within 30 seconds of the newest accepted observation. It requires positive time and at least 5 m displacement; it returns null outside recording and after more than 30 seconds since that observation. Exactly 30 seconds is still available. Resume selects its new segment so previous-segment pace is not reused. Quality errors do not independently suppress pace until freshness/recording checks do; a recently computed value may survive a task error briefly.

Split crossings interpolate active time between adjacent same-segment movement edges. First split starts at active time zero; following splits subtract the previous crossing. Coverage gaps retain active time but invent no missing distance. The loop handles every crossed 1000 m boundary. Given current speed/gap limits, multiple kilometres in one physically accepted edge are impossible; multi-boundary unit tests test reducer robustness, not realistic GPS acceptance.

The reducer is deterministic on an ordered unique ledger and does not bridge segments/gap anchors. Partial kilometres are separate. Unique session/kilometre keys prevent repeated inserts, but cannot correct an already persisted incorrect crossing. R1 therefore blocks approval of split timing. Rounded millisecond crossings are interpolation estimates, not millisecond physical accuracy.

## Persistence, history and shared contract

Inspected `src/data/migrations.ts` migration 21: additive CREATE TABLE/INDEX statements for edges, splits and GPS state; no activity rewrite/deletion. Session metric version already exists. New starts use v2; legacy reads default to v1, preserve stored distance and expose null split evidence. V2 exposes an empty split array before the first kilometre.

`trackingMetricsRepository` reads by owner/session; GPS upsert prevents changing another owner's row. Unique keys protect edge/split identity. Native batch processing wraps route/edge/split/state/checkpoint updates in `withExclusiveTransactionAsync` via `ExpoSqliteDatabase`. Migration and repository tests use a simplified in-memory database. Their rollback test proves mock behavior, not native SQLite crash recovery, uniqueness enforcement or upgrade behavior on an existing phone. No destructive statement was found in migration 21.

Owner/session/time and owner/session/km indexes support reads, but do not remove the all-history workload. Account exports/deletion in `repositories.ts` include the new tables. Tracker History deletion includes them. The separate `exportGuestTrackerData` exports edges/splits but not GPS-state diagnostics; document this limitation if that export is used for field investigation.

`trackerHistory.ts` uses stored distance and active segments and loads v2 splits. History UI rounds seconds/metres for its receipt; minor display rounding is not a new accumulation algorithm. Historical v1 distances are not recalculated by this patch.

`src/application/liveRunMetrics.ts` supplies the shared typed contract to `src/app/run.tsx`, `src/app/training/[sessionId].tsx` and `src/features/execution/GuidedFoundationWorkoutScreen.tsx`. Units are milliseconds, metres, seconds/km. Null pace means unavailable, null splits mean legacy unsupported, empty splits mean none completed. Guided phase is caller-supplied from the existing execution view. No second GPS subscriber is added. The guided screen calculates the selector twice (clock then phase-attached view); this repeats work, not independent accumulation. UI one-second evaluation ticks are not distance writers.

## Verification and handoff

Independent test file: `tests/domain/gpsIndependentReview.test.ts`. Seven cases cover delayed-time clipping, slow walking, good-accuracy small increments, short out-and-back, curves, pause boundaries, and 1001-edge replay/splits/freshness. **Two use Jest `test.failing`** to encode required behavior that currently fails. A green test command therefore does NOT mean these defects are fixed. Remove `.failing` when correcting each defect.

Focused tracking run: 5 suites / 46 tests reported passed, including those two expected failures. TypeScript passed. Full ESLint completed with zero errors and two existing array-type warnings in `src/features/execution/workoutPresentation.ts` (lines 93 and 118). Full Jest: 118 suites / 686 tests reported passed, including the two expected failures. No Gradle or physical-device checks were run.

Recommended order for Sol:
1. Fix R1 and add persisted delayed-edge/split regression tests.
2. Resolve R2's observation-continuity versus movement-anchor interaction with uncertainty-aware tests.
3. Resolve interruption cutoff/message semantics and durable resume-error state.
4. Test late-tail handling, lifecycle cutoff races, consistent snapshots and real SQLite rollback/restart/owner isolation.
5. Bound live processing without changing historic records; rerun existing tracking, guided, speech, feedback and History tests.
6. Re-review before Terra treats v2 distance/pace/splits as ready for the dashboard. UI scaffolding can use the contract, but metrics are not approved by this review.

Physical acceptance still required: stationary recording; measured straight kilometre; slow walk; curved/out-and-back route; pause with 60 seconds of movement; resume; screen lock and app switch; weak-signal/recovery; permission revocation; Finish; restart; History comparison. Capture device/OS, permissions, battery restrictions, observation/processing times, accuracy, rejected reasons, segments, edges and splits with user consent. Use measured distance as reference, not another GPS device as unquestioned ground truth. Force-stop is an interruption test, not a promise of uninterrupted recording.
