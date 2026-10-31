# GPS training implementation progress

## Audit, 2026-10-26

- The stack is Expo 58, React Native, TypeScript, Expo Router, SQLite and Supabase authentication (`package.json`, `src/services/auth/supabase.ts`). Location and task-manager packages have now been installed at SDK-compatible versions; there was no prior GPS recorder.
- Existing flow: onboarding (`src/app/onboarding/[step].tsx`) → demo generation (`src/application/activateDemoOnboarding.ts`, `src/domain/training/engine.ts`) → Today/Plan and workout detail (`src/app/(tabs)`, `src/app/workout/[sessionId].tsx`) → saved outcome (`src/application/recordSessionOutcome.ts`) → plan review and adjustment (`src/application/planReview.ts`, `src/domain/training/adjustment.ts`) → revision and reminders (`src/application/applyAdjustment.ts`, `src/application/reminderRefresh.ts`). History reads `activity_logs`. Production templates and numerical adaptation policy remain unreviewed.
- Reusable pieces: design components, prescription snapshots, revision fingerprint checks, activity history, feedback/review and reminder reconciliation. Gaps: existing activity logs are not account-scoped; standalone activity does not enter review inputs; existing tracker setup/live screen and route ownership do not exist.
- Android uses a checked-in native project and `scripts/build-android.ps1`, which builds x86_64 via a short path. The manifest currently has no explicit location configuration; `android:allowBackup` is true. Do not assume routes are excluded from device backups. There is no background location task or GPS UI yet.

## Data contract and migration

Migration 9 adds tracking sessions with owner, optional plan association and snapshot, state, timestamps, segments, distance and metric version; route points have timestamp, accuracy and segment. A partial unique index reserves a single active session. Existing plan and activity tables are untouched. The local export and deletion table lists include the new tables. This schema is groundwork only: an account-scoped repository, recorder and integration into History still need implementation and device verification.

Target pipeline: explicit session start → permission/fix or timer-only → one serialized foreground/background recorder → durable checkpoints → finish or interrupted recovery → persist actual activity independently of feedback → explicit scheduled outcome or standalone history → review with current revision/fingerprint → reminders. Never automatically resolve a scheduled workout from tapping Finish.

## Checklist

- [x] Inspect existing stack and training policy; preserve worktree and native customization.
- [x] Install SDK-compatible `expo-location` and `expo-task-manager` through Expo tooling.
- [x] Add pure GPS filtering and lifecycle primitives with synthetic tests. Thresholds are engineering choices, not health or coaching policy.
- [x] Add additive migration 9 and include tracker tables in local export/deletion. Migration preservation is tested with the repository's in-memory database adapter, not a native device.
- [ ] Build account-scoped repository and one authoritative serialized recorder with durable checkpoints and explicit interruption handling.
- [ ] Implement scheduled and standalone setup, foreground permission handling, live UI, summary and feedback.
- [ ] Add and verify Android/iOS native location configuration, module-scope task, screen-lock/background behavior, fallback and cleanup.
- [ ] Connect saved GPS activities to History and the existing plan-review flow without duplicate counting or assuming completion.
- [ ] Test real SQLite migration, permission denial, offline, emulator routes, screen lock, account isolation and real GPS on physical Android; iOS requires separate verification.

## Metric conventions

The preliminary filter rejects missing or worse-than-50 m accuracy, stale/out-of-order samples and jumps over 12 m/s; ignores displacement below 5 m or the bounded reported accuracy; and starts a new segment after a gap over 30 seconds. Live pace uses a rolling 30-second accepted-distance window. These are provisional engineering parameters requiring route and device validation. Average pace uses active recording time; a timer-only distance and pace remain unknown. GPS positions are used to calculate distance but routes are not currently saved or displayed.

## Scheduled workout flow, 2026-10-26

- Workout detail opens a run/walk selector and foreground-only GPS recorder, with timer-only fallback. Progress is checkpointed locally; backgrounding pauses recording. A restarted interrupted workout can be finished or discarded. No background or screen-lock recording is implemented.
- Finish saves the recording separately, then opens the existing outcome form with its duration, optional GPS distance and provenance. A walk is recorded as a different activity. The recording can be recovered for feedback from the workout screen. History and plan review are updated only when that form is submitted.
- Local tracking currently uses a device-level owner, not account isolation. The route is not saved; standalone recording and map display are not implemented. These remain open requirements, and physical GPS, backgrounding, restart and emulator journeys still require device verification.
- Android needs a rebuilt development app with the location module and permission; location services and foreground permission must be enabled on the device. Expo Go and iOS have not been tested for this flow.
- The x86_64 Android debug build completed and installed on emulator-5554 without clearing app data. The launcher was invoked, but the workout journey and a simulated GPS route have not been verified on that emulator. Physical-device and iOS GPS remain unverified.

## Workout checkpoints and recovery

Settings → Workout checkpoints shows the most recent 40 timestamped events, including permission, signal, checkpoint storage, pause, finish, feedback/History and reminder failures. The events contain no coordinates or feedback answers and remain local. Diagnostics are best effort: storage failure can itself prevent checkpoints from being retained. Deleting local planner data also removes these events.

Progress checkpoints are written about every five seconds while the screen is foregrounded. After interruption recovery closes the active segment at the last saved checkpoint; time since that checkpoint is unknown. Finishing stores the recording, and submitting the feedback form creates the History record. GPS location points and maps are not retained. If feedback is postponed, return to the same workout and select Continue feedback; a changed or unavailable plan can prevent this association and requires further work.

The Android build script defaults to x86_64 for the emulator. It accepts `-Architecture arm64-v8a` for a typical physical Android phone; check the device ABI first. This added option has not yet been verified with a physical-device build.
