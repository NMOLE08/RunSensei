# Torto shared live-run metrics handoff

Implementation status: corrected metric version 3 remains used for newly started sessions. Metric versions 1 and 2 remain historical and are not recomputed. A proposed v4 movement model failed its stationary-noise gate and is not integrated. Terra dashboard integration remains blocked pending an independently accepted distance model and physical Android validation.

## Consumer API

Import `liveRunMetrics` from `src/application/liveRunMetrics.ts`. Pass the current `TrackerSnapshot`, an explicit evaluation timestamp in Unix milliseconds, and optionally the existing guided phase view.

The returned `LiveRunMetrics` type is exported from `src/domain/tracking/liveRunMetrics.ts`.

- `activeElapsedMs`: active segment time; pause intervals are excluded.
- `distanceMeters`: validated stored distance, or `null` for timer-only/unknown distance.
- `averagePaceSecPerKm`: active time divided by validated distance; `null` when unavailable.
- `rollingPaceSecPerKm`: current-segment 30-second rolling pace; `null` while paused, stale, or unsupported.
- `completedKmSplits`: `null` for metric version 1 without versioned evidence, `[]` for a supported version 2/3 session before its first completed kilometre.
- `currentPartialKm`: the unfinished kilometre and active time since its previous boundary; never a completed split.
- `gpsQuality.state`: `acquiring | reliable | degraded | stale | unavailable`.
- `recordingState`: the existing tracker lifecycle state. A paused workout should be presented as paused rather than as GPS loss.
- `lastAcceptedLocationTimestampMs`: observation time, not callback processing time.
- `guidedPhase`: the existing guided phase view when the caller supplies it; otherwise `null`.

## Update behavior

The GPS TaskManager pipeline remains authoritative. UI screens do not start another location watcher. Tracker persistence is reconciled on the existing subscription/checkpoint cycle; callers may update only the explicit evaluation timestamp each second for clocks and freshness expiry. A UI timer never adds distance or changes stored evidence.

Headless callbacks now resolve the singleton `tracking_active_gps_binding`; they must not select a session by checkpoint recency. This ownership correction does not change the public metrics fields.

## Presentation guidance

- Do not display `0:00` for a nullable pace; show unavailable state.
- Show at most the desired recent split subset, but retain the returned stable split identities.
- Display quality reason codes through user-friendly text rather than exposing internal identifiers.
- Version-1 history may show distance and average pace but must not claim exact kilometre splits. Existing version-2 evidence retains its original stored interpretation; version 3 identifies the corrected observation-continuity and active-time behavior.
- Do not present metric version 4: the prototype is isolated research code and failed its production safety gate.
