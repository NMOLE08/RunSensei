# GPS lifecycle correction handoff

Status: implemented and automatically verified on 14 November 2026. Physical Android verification remains required. Production distance filtering remains Metric V3; the isolated Metric V4 prototype is unchanged.

## Durable lifecycle rules

- Pause and Finish install an in-memory cutoff immediately, then persist the same cutoff and a unique cutoff token before native collection is stopped.
- The cutoff transaction reconciles only observations whose observation timestamp is after the boundary. Metric edges, cumulative distance, GPS anchors, checkpoint state and kilometre splits are rebuilt atomically. Valid evidence at or before the cutoff is retained.
- Resume checks permission before changing durable state. Session Resume and binding-generation advancement commit in one exclusive SQLite transaction. Native collection starts only afterward.
- A failed native restart compensates only the exact owner, session and consumed generation. The generation is not reused. Evidence assigned to the failed segment is deleted atomically, cumulative distance/GPS anchors/splits are rebuilt, the segment is removed, and the session returns to Paused.
- Recovery reads the exact active GPS binding before considering a newest-session query. A recording found after process interruption is stopped and made explicitly Interrupted.

## Migration 24

Migration 24 adds lifecycle metadata to `tracking_active_gps_binding`:

- `cutoff_token`
- `pipeline_epoch`
- `pipeline_started_at_ms`
- trusted foreground anchor timestamp, coordinates and accuracy
- `quarantine_state` (`pending`, `ready`, or `blocked`)

The JavaScript pipeline epoch is a recovery and containment value. It is not a native Expo callback identity.

## Callback containment and limitation

Callbacks earlier than the persisted pipeline start are rejected. A pending pipeline accepts only the exact explicitly acquired foreground anchor before becoming ready. A blocked binding rejects all location evidence. Delayed batches are still assigned by observation time and recording segment, never callback-processing time.

Expo `LocationObject` does not carry Torto's session or generation. Once quarantine is open, a stale native callback whose timestamp and coordinates are plausible inside the replacement segment may remain indistinguishable from a genuine callback. Guaranteed attribution would require a small native Android adapter that attaches a durable generation token to every emitted observation. That future work is intentionally not implemented here.

## Account transitions

The exact persisted binding remains the recording ownership authority. Every restore, null-session event and explicit sign-out resolves the previous persisted `active_account_id` before it can be cleared. Failed interruption preserves the original workout and binding, clears the visible authenticated user, and shows a recoverable `account_transition_blocked` screen. Retry continues against the original persisted account ID; another account does not inherit the workout.

Independent review initially found missing failed-Resume evidence cleanup, an early null-auth ownership gap, and a Metric V1 compensation edge case. All were corrected before this handoff. Regression coverage now checks Metric V1 distance reconstruction plus Metric V3 point/edge removal, split rebuilding and GPS-anchor restoration. Its remaining concern is device-level Expo callback attribution, which cannot be proven by JavaScript source or automated tests.

## Independent review checklist

- Verify migration 24 upgrades a populated migration-23 database without changing prior rows.
- Inject failure at each Resume write and confirm transaction rollback or generation-safe compensation.
- Hold a background writer across Pause and confirm post-cutoff evidence is removed without changing pre-cutoff evidence.
- Fail account-exit cutoff persistence and confirm the original binding remains owned and the protected UI stays blocked.
- Confirm exact-binding recovery ignores a newer unrelated session.
- Confirm Metric V3 outputs and historical completed activities remain unchanged.
- Confirm the Metric V4 module remains unreferenced by production tracking.

## Physical Android procedure

1. Upgrade the installed app without uninstalling or clearing data.
2. Start a GPS workout and walk for two minutes; lock the screen for one minute.
3. Pause, move at least 30 metres, wait, then resume. Confirm paused movement and time are excluded.
4. Switch apps during recording, return, and confirm the same workout/session continues.
5. Repeat Pause/Resume rapidly and confirm only one Resume occurs.
6. Revoke background location while paused, attempt Resume, and confirm the workout stays Paused with an actionable error.
7. Finish while location updates are active, reopen History, and compare distance, active time, route and splits.
8. Restart Torto during an unfinished recording and confirm explicit interruption recovery rather than silent Resume.
9. During a recording, attempt sign-out/account switching and confirm failure recovery never exposes the workout to another account.

Screen-lock recording, delayed native callbacks and weak-signal behavior are not considered physically verified until these steps are completed on the target Android phone.
