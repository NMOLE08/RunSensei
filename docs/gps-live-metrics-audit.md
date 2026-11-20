# Torto GPS and live metrics audit — 11 November 2026

Repository inspection and synthetic tests only. Android location accuracy and screen-lock delivery remain unverified. No production calculations or persistence code changed.

## Current pipeline

- `src/app/_layout.tsx` imports `application/backgroundGpsTask.ts` at module scope. That module registers `BACKGROUND_GPS_TASK` using TaskManager.
- `application/workoutTracker.ts`: `startTracker` gets foreground/background permission and a filtered initial fix, creates one account-owned session, checkpoints it, and starts `startLocationPipeline`. Expo `startLocationUpdatesAsync` requests High accuracy, 1-second/1-metre updates, disabled automatic pauses, and a location foreground-service notification. These are requested delivery settings, not accuracy guarantees.
- `backgroundGpsTask.ts`: `persistLocationBatch` serializes batches, loads the persisted recording session, restores the latest 20 accepted points in its current segment, sorts incoming samples, filters them, inserts accepted points, and updates distance/checkpoint in a transaction. The queue is in-process, not an inter-process lock. The background lookup relies on the single-active-session invariant rather than React authentication state.
- `domain/tracking/metrics.ts`: `acceptTrackPoint` owns filtering and distance; `restoreRouteState` reconstructs recent pace data but keeps persisted distance authoritative.
- `pauseTracker`, `finishTracker`: stop collection, flush the current write queue, reread persistence, then transition/checkpoint. `resumeTracker` retains the session identity and creates a new active segment. Background AppState does not pause; foreground return reconciles persistence and checks service/permission availability.
- `recoverTracker` treats a recording found after process restart as interrupted, closing its active segment at its saved checkpoint. It does not silently resume.
- `trackerHistory.ts`: `openTrackerHistory` loads owner-scoped saved sessions; `mapRow` exposes active seconds, wall elapsed seconds, and persisted distance separately. Feedback remains separate. Run, planned training and guided screens consume the existing recorder, but format metrics separately.
- Checked-in Android manifest declares foreground/background location and location foreground-service permissions. Physical delivery still needs device verification.

## Exact current mathematics

Coordinates use radians. Haversine edge distance is `2 * 6371000 * atan2(sqrt(a), sqrt(1-a))`, where `a = sin²(Δlatitude/2) + cos(latitude1)*cos(latitude2)*sin²(Δlongitude/2)`.

Only accepted edges add to distance. First fixes and gaps above 30 seconds establish an anchor with zero added distance. Accuracy must be finite, nonnegative and at most 50 m. Coordinates/timestamps must be finite and valid; timestamps over five seconds in the future are invalid. Samples older than 30 seconds at processing, or no later than the last accepted timestamp, are stale. Speed above 12 m/s is a jump. Displacement below `max(5, min(currentAccuracy, previousAccuracy))` is jitter. Equality is accepted. These are engineering filters, not verified physiological or accuracy guarantees.

Active seconds = `Σ max(0, (segment.end ?? observationTime) - segment.start) / 1000`. Closed pause intervals are not included. Overall average pace = `1000 * activeSeconds / distanceMeters`, in seconds/km; null for unknown/zero distance or nonpositive active time. It includes stationary time while explicitly recording.

Rolling pace = `1000 * (lastTimestamp-firstTimestamp)/1000 / (lastDistance-firstDistance)` over retained accepted samples within 30 seconds of the latest accepted sample. It needs positive time and at least 5 m distance. It has no current-clock argument and therefore no freshness check. This is rolling pace, not instantaneous speed.

Standalone display uses kilometres; planned training converts distance using the existing unit helper and multiplies sec/km by 1.609344 for sec/mile. Existing minute/second clocks do not switch to hours after 60 minutes. No kilometre split calculation or persisted split contract exists.

## Confirmed limitations and defects

1. **Stale rolling pace:** without a new accepted fix the old pace remains available indefinitely. Rejected samples do not expire the window. A new accepted gap anchor clears it; silence does not. Reproduced by characterization tests.
2. **Stationary drift:** alternating plausible fixes eight metres apart with reported 3 m accuracy adds 40 m over five edges. Reproduced. Whether a particular device produces that trace is unverified; no filter can infer actual movement solely from these fixes with certainty.
3. **Delayed batch loss:** processing-age rejection discards valid-in-order locations older than 30 seconds. This can undercount batched background delivery. Reproduced at the filter level; real batching frequency is unknown.
4. **Segment membership not checked:** `persistLocationBatch` labels every accepted sample with the current segment without comparing its timestamp with that segment's start. A delayed sample from a pause/previous segment can become the resumed anchor and a subsequent edge can include paused movement. Source-confirmed missing guard; service-level reproduction is still required.
5. **Silenced task errors:** the TaskManager callback returns immediately on `error`; there is no durable error/quality observation. Permission/service checks happen on foreground reconciliation, not every headless failure.
6. **Quality messages can remain stale:** `gpsSignal` becomes weak after a timeout but is not reset by accepted batches. Persistence reconciliation preserves the previous message. No structured public quality contract exists.
7. **Checkpoint is not a reliable-fix timestamp:** processing any nonempty batch advances checkpoint even if all points are rejected; foreground time checkpoints also advance it. Recovery time therefore represents observed application recording time, not proof of GPS coverage.
8. **Rolling reconstruction differs from an uninterrupted window:** only 20 accepted samples are loaded, which can cover less than 30 seconds. Replay refilters accepted samples without storing original cumulative edge distances. Distance remains authoritative, but reconstructed rolling pace can differ.
9. **Pause/Finish boundary occurs after asynchronous stop/flush:** active time includes stop latency until `Date.now()` at transition. This is current semantics, not evidence that closed paused time leaks. Already-received queue flush does not prove every future native callback has arrived.

History and live use the same persisted distance/segments, but live state refreshes about every five seconds; Finish can incorporate newer points. History also exposes wall duration separately. Compare active time to active time, not wall elapsed. No confirmed arithmetic discrepancy between finalized active duration and History was found.

## Proposed completed kilometre splits

Use the authoritative accepted-distance ledger, not raw coordinate replay. Persist per accepted point cumulative distance, cumulative active milliseconds, recording segment and metric version through a future additive migration. Preserve existing records. Legacy sessions without sufficient evidence must report reconstruction unavailable or explicitly estimated; never relabel reconstructed values as exact historical measurements.

For each valid accumulating edge from `(d0,a0)` to `(d1,a1)`, process all boundaries `b=1000*k` with `d0 < b <= d1`. Interpolate active crossing time `a(b)=a0+(b-d0)/(d1-d0)*(a1-a0)`. This assumes constant movement along that accepted edge and must be documented as interpolation. Split duration is the difference between consecutive active crossing times; because the split is 1 km, split pace in sec/km is durationMs/1000. First split starts at session active time zero, including recording time before movement.

No interpolation across pauses or excluded GPS gaps. Pause closes the segment and Resume starts a new anchor without bridging distance. Active time includes recording time during a GPS gap, but no missing distance is invented; flag affected splits as incomplete GPS coverage. Partial kilometre distance is cumulative distance minus completed kilometres; its elapsed time begins at the last crossing, and it is never a completed split.

Use stable session/km identities and derive splits deterministically from the persisted ledger. Duplicate events add neither edges nor splits. Reject cross-segment/out-of-order events before accumulation. Multiple boundaries are supported by the reducer even though the current 12 m/s and 30-second edge limits normally prevent an accepted edge spanning a whole kilometre. Validate with synthetic ledger inputs, not teleporting GPS samples.

## Proposed GPS quality model

Use `acquiring | usable | degraded | stale | no_fix | unavailable`. Usable means enough recent accepted evidence for a metric, not scientifically verified positional accuracy. Track last received, accepted and rejected sample times, reported accuracy, rejection reason, service/task errors and segment identity. Preserve permission failures as availability causes, not signal strength.

Precedence: service/permission/task failure → unavailable; explicit fix acquisition → acquiring; no accepted fix after acquisition → no_fix; accepted fix beyond the authored freshness window → stale; recent accuracy rejection/insufficient metric support → degraded; otherwise usable. Keep quality and metric availability separate: one usable anchor cannot produce rolling pace. Freshness should initially reuse the existing 30-second engineering setting, with explicit review/versioning; do not introduce an unreviewed second threshold. Paused state comes from recordingState and must not masquerade as signal loss.

## Proposed shared contract for the UI engineer

```ts
interface LiveRunMetrics {
  sessionId: string;
  ownerId: string;
  metricVersion: number;
  observedAtMs: number;
  activeElapsedMs: number;
  distanceMeters: number | null;
  averagePaceSecPerKm: number | null;
  rollingPaceSecPerKm: number | null;
  completedKmSplits: readonly {
    kilometre: number;
    crossingActiveMs: number;
    durationMs: number;
    paceSecPerKm: number;
    gpsCoverage: 'continuous' | 'gaps';
  }[] | null;
  currentPartialKm: {
    kilometre: number;
    distanceMeters: number;
    activeElapsedMs: number;
  } | null;
  gpsQuality: {
    state: 'acquiring' | 'usable' | 'degraded' | 'stale' | 'no_fix' | 'unavailable';
    reasonCodes: readonly string[];
    lastReceivedTimestampMs: number | null;
    accuracyMeters: number | null;
  };
  recordingState: TrackingState;
  lastAcceptedLocationTimestamp: number | null;
  guidedPhase: ReturnType<typeof guidedPhaseView> | null;
}
```

Null splits mean unavailable evidence; empty splits mean supported recording with no complete kilometre. Null pace means unavailable, never zero. Null guidedPhase means no guided association. The service must attach the existing guided view only after matching session/account identity. One application selector should supply all three screens from the same persisted tracker snapshot and explicit evaluation time. No new timer or GPS subscriber in the UI. Nullable values should have companion reason codes when the UI needs an explanation.

## Implementation sequence and approval points

1. Add regression reproductions for delayed samples across Resume, stop latency, reconstruction and task errors. Fix segment membership and service error visibility first; explicitly decide the Pause/Finish effective boundary.
2. Implement one freshness-aware metric selector and structured quality observations. Preserve filter constants until evidence supports a separately reviewed change. Rolling pace is null while paused/interrupted/stale or insufficient; average pace remains a cumulative fact with coverage warnings.
3. Add a versioned accepted-edge ledger and split reducer with deterministic replay. Decide delayed-batch acceptance policy separately from UI work; record observation time versus delivery time.
4. Connect the three screens to this contract, then implement the dark dashboard. Keep Finish/feedback/account identity unchanged.
5. Run indoor permission/restart tests and outdoor measured-route testing before describing metrics as accurate.

## Physical evidence required

Use an open-sky measured route, stationary start, steady measured kilometre, deliberate 60-second pause with movement, locked-screen segment, app switch, weak-signal section and finish/restart. Record device/OS, battery optimization, permissions, service notification, wall timestamps, displayed active time/distance/pace and final History values. Compare with measured route distance; another GPS watch is a comparator, not ground truth. Export account-owned checkpoints/route evidence with consent. Test force-stop separately: it must be reported as interruption, not promised continuous tracking. No such physical verification occurred in this audit.
