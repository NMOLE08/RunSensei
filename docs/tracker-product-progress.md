# Tracker product progress

Last updated: 2026-10-29. This document is the active delivery record for the tracker-first product direction.

## Confirmed scope

- Android first, outdoor running first.
- Tracker-only mode is the default product mode.
- Run is the primary activity and Walk is secondary.
- GPS is mandatory. Recording time does not begin until location services, foreground permission, and a usable GPS fix are available.
- Distance is stored in metres and displayed in kilometres. Pace is displayed in minutes per kilometre.
- Data is local-only under a per-install guest namespace. Existing account-owned records remain isolated.
- Manual pause/resume only. Automatic pause is deferred.
- Planning, onboarding, authentication, cloud sync, reminders, coaching, subscriptions, and social features are retained in source but inactive in tracker-only mode.

## Phase 0 audit baseline

### Reuse

- Expo SDK 58, Expo Router, Expo SQLite, Expo Location, Expo Task Manager, the existing design system, timestamp-based active segments, GPS filtering, rolling live pace, serialized SQLite checkpoints, interruption recovery, and the Windows short-path Android build script.
- `tracking_sessions` and `tracking_points` are additive tables and do not overwrite plan/activity history.

### Change

- Startup currently initializes Supabase and exposes Today/Plan/Profile. Tracker-only startup must avoid those initializers and show Run/History.
- The recorder currently requires an active account and scheduled workout. It must accept a local guest owner and a null plan association.
- Finished tracker sessions currently require plan feedback before appearing in History. Tracker history must read saved tracker sessions directly.
- GPS recording currently starts its clock before the first accepted fix. Acquisition must finish before the recording transition.
- The app pauses on background. Screen-lock tracking requires a module-scope background task and Android foreground service in a later phase.

### Deferred roadmap

The plan/template/adaptation roadmap in `next-version-progress.md` is preserved for possible future restoration but is not active product work. No existing plan, profile, account, or activity data will be deleted or exposed to guest mode.

### Automated baseline

- TypeScript: passed.
- ESLint: passed.
- Jest baseline before tracker-only changes: 25 suites / 77 tests passed.
- Expo Doctor: 18/20 checks passed. Open findings are native/app-config synchronization and 13 Expo/React Native patch-version mismatches.

### Unverified baseline

- No physical outdoor GPS accuracy result exists.
- Screen-lock/background recording is not implemented.
- No route persistence or standalone local History exists yet.
- A successful build or launch is not evidence that tracking is reliable.

## Phase checklist

- [x] Phase 0: audit startup, auth, navigation, database, recorder, saving, native configuration, build requirements, and automated baseline.
- [x] Phase 1 technical implementation: tracker-only startup, per-install guest identity, Run/History navigation, no auth/cloud/planner initialization, standalone local save. TypeScript and ESLint pass; Jest passes 25 suites / 79 tests, including GPS-before-clock and plan-free guest saves. Fresh-install and existing-install behavior still require device verification before the acceptance result is final.
- [ ] Phase 2: plan-independent recording engine and durable lifecycle/route/checkpoint model.
- [ ] Phase 3: foreground GPS acquisition, filtering, metrics, responsive live screen, and synthetic route coverage.
- [ ] Phase 4: Android foreground service and background/screen-lock recording with recovery.
- [ ] Phase 5: finish/save/discard, summary, local History/detail, and deletion.
- [ ] Phase 6: outdoor-readable design and accessibility pass.
- [ ] Phase 7: physical Android outdoor validation and measured tuning.

The repeatable physical test procedure and failure-report format are in `outdoor-gps-test-checklist.md`.

Optional Strava connection groundwork is tracked separately in `strava-integration-progress.md`. Strava activity import and Strava-derived plan personalization remain disabled pending written authorization and secure server deployment.
