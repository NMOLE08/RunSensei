# GPS V4 correction work: safety gate result

Implementation review date: 13 November 2026. Source and deterministic tests only; Android field behavior remains unverified.

## Outcome

The proposed metric-version-4 distance model was evaluated as a pure, isolated prototype before persistence integration. It improved straight, circular and U-turn synthetic traces, but failed the mandatory stationary-noise gate: deterministic incoherent scatter inside an eight-metre radius accumulated approximately 100 metres. It is therefore **not connected to production tracking**, new sessions remain metric version 3, and no stored evidence is reinterpreted.

The independent safe corrections were implemented:

1. strict live/new recording-timeline validation;
2. migration 23 and a durable singleton active-GPS binding;
3. bound headless callback routing, lifecycle generation checks and safe stale-binding recovery;
4. account-exit interruption before authentication ownership is cleared.

## Timeline validation

`validateRecordingTimeline` rejects non-finite, negative-duration, overlapping, nested, duplicated, out-of-order and non-terminal open segments. `strictActiveSeconds` and `activeMillisecondsAt` use this validation for live metrics, guided phases and background guided reconciliation. Historical v1-v3 History continues using its stored interpretation and is not recalculated or invalidated.

Normal adjacent Pause/Resume boundaries remain valid. The active-time position is monotonic and cannot count one millisecond twice.

## Movement prototype result

The prototype uses a configurable 30-second / 64-observation buffer and requires four monotonically advancing projected observations before committing a conservative chord. The window is bounded (64 point objects) and intended to span the existing pace freshness interval. It was not persisted because it failed the correctness gate.

Representative deterministic output:

| Trace | Truth | Prototype | Error |
|---|---:|---:|---:|
| Straight, 20 m accuracy | 120 m | 120 m | 0% |
| Slow straight, 20 m accuracy | 120 m | 120 m | 0% |
| 10 m-radius circle, 20 m accuracy | 62.83 m | 40 m | -36.3% |
| 20 m-radius circle, 20 m accuracy | 125.66 m | 103.01 m | -18.0% |
| 40 m-radius circle, 20 m accuracy | 251.33 m | 248.47 m | -1.1% |
| 40 m out-and-back | 80 m | 80 m | 0% |
| 80 m U-turn | 160 m | 160 m | 0% |
| Zigzag | 113.14 m | 63.25 m | -44.1% |
| High-frequency straight | 120 m | 118.5 m | -1.25% |
| Incoherent stationary scatter | 0 m | ~100.09 m | unsafe false distance |

The prototype is useful research evidence, not an available metric version. A future candidate needs a statistically defensible stationary process/noise model and Android traces with known ground truth.

## Active GPS binding

Migration 23 adds `tracking_active_gps_binding`, a singleton binding containing owner, session, generation, lifecycle state, cutoff and update time.

- Start cannot replace another live account/session binding.
- A binding is reclaimed only if its bound session is absent or terminal.
- Background callbacks resolve the exact bound owner/session and never select by checkpoint recency.
- Pause publishes `draining`, then `paused`; Resume increments generation; Finish moves to `finishing` and clears only after the saved checkpoint.
- Legacy active sessions can acquire a binding without changing their metric version.
- Account exit durably interrupts a recording before releasing its binding. Failure stops the account-exit operation rather than silently transferring GPS ownership.

The TaskManager payload itself does not contain a generation token. Safety therefore also depends on stopping/flushing the previous native pipeline before binding release. Old observations captured before a replacement session are rejected by segment membership. Android headless delivery ordering still requires physical testing.

## Astra re-review focus

1. Verify malformed timelines fail without affecting historical History reads.
2. Verify every headless query uses the active binding and no checkpoint-recency fallback remains.
3. Exercise Pause/Finish transaction failure and binding retention.
4. Exercise logout/account switch failure: ownership must not clear if interruption cannot persist.
5. Confirm the v4 prototype is unreachable from `workoutTracker` and new sessions remain v3.
6. Independently assess a future movement model; this work does not approve v4 distance.

