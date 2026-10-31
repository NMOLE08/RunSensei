# AiSensei — Project Context and Handoff

Last updated: 2026-10-29
Primary direction: **build a reliable local-first outdoor run tracker before returning to personalised training plans, accounts, or the AI Run Sensei.**

## Product vision

AiSensei began as a running app for people aiming to complete 5K, 10K, half-marathon (21.1 km), and marathon (42.2 km) events. The intended differentiator is a playful AI "Run Sensei" that can motivate or lightly roast a runner when they fall behind pace or skip a session.

The app should feel energetic and distinct, while still being safe: no pressure to run through pain, illness, or unreliable GPS data.

## Current product decision

The personalised-plan experience is consuming time and is not yet dependable. For the next development period, the app is a run tracker first.

The one complete user journey to optimise is:

```text
Open app → Start outdoor run → acquire GPS → record distance/time/pace → pause or resume → finish → save locally → view result and history
```

Do **not** continue expanding training-plan templates, recommendation logic, onboarding, sign-in, account recovery, cloud sync, notifications for plans, subscriptions, social features, coach chat, or roast generation until the tracker is solid.

Do not delete those features. Make them inactive through a reversible tracker-only app mode so the work can be restored later.

## Immediate tracker scope

### In scope

- Android first, outdoor running first.
- Kilometres, metres internally, and pace shown as min/km.
- Local-only storage; usable offline after installation.
- Guest usage with no account, login, or questionnaire.
- Foreground recording, then background/screen-lock recording.
- Manual pause and resume.
- Save and view completed local runs.
- Honest GPS quality and error states.
- Retain the existing AiSensei visual language.

### Deferred

- Firebase/Supabase authentication and cloud sync.
- Onboarding questions and profile-based personalisation.
- 5K, 10K, half-marathon, and marathon plans.
- Workout templates, scheduling, reassessment, and feedback adaptation.
- Nutrition, diet, recovery coaching, and reminders.
- AI Run Sensei roasts, live voice/audio, coach chat, and LLM integration.
- Automatic pause, route sharing, social feeds, subscriptions, and paid map services.

## Design direction

The supplied design reference establishes the intended visual style:

- White or warm off-white surfaces.
- Strong black typography and black controls.
- Lavender/periwinkle accent colour.
- Spacious composition with large numerical metrics.
- Pixel-inspired/monospaced display typography for large numbers and short labels, while maintaining readability.
- Subtle topographic-line and running-motion visual language where it does not compromise performance or clarity.
- Large, outdoor-readable touch controls and clear recording/paused states.

Do not copy Strava branding, orange palette, or exact layouts. Strava is a reference for the core run-recording journey, not a visual template.

## Required tracker behaviour

### Recording lifecycle

Use a recording engine separate from screen components. The expected state model is:

```text
idle → acquiring GPS → recording ↔ paused → finishing → saved
                              ↓
                   recoverable error / interrupted
```

Requirements:

- Exactly one active session at a time.
- Navigation, app rerenders, and repeated taps must not create duplicate location subscriptions.
- A finish action must be idempotent: it cannot create duplicate activities.
- Persist checkpoints during an active recording so reopening the app can recover known progress.
- Do not use a UI interval as the authoritative elapsed-time source; calculate time from timestamps and paused intervals.
- Do not promise survival after Android force-stop or device shutdown.

### Metrics

Record and display:

- Distance: store metres, show kilometres.
- Active duration: excludes paused time.
- Total elapsed duration: shown separately when useful.
- Current pace: min/km, smoothed across a documented rolling window.
- Average pace: calculated from total active time ÷ accepted total distance, never the mean of individual pace readings.
- GPS state/quality.

Show `—` for pace when distance or data quality is insufficient. Do not show fabricated precision.

### GPS sample handling

The location pipeline must account for:

- Permission denied or location services disabled.
- GPS acquisition before recording starts.
- Low accuracy, stale, duplicate, out-of-order, and implausible samples.
- Stationary GPS drift.
- Sharp turns, slow movement, walking breaks, and temporary GPS loss.
- Paused sections and long gaps: never invent a straight-line connection as recorded distance.

Filtering and smoothing must be documented as configurable engineering policies. Aggressive filtering can drop real movement; weak filtering inflates distance. Preserve accepted samples and metadata needed to explain the final result.

### Background recording

When implemented, Android recording should continue while the phone is locked or the app is backgrounded, subject to Android permissions and OS limits.

- Use Expo APIs compatible with the installed Expo SDK.
- Request foreground and background permissions progressively with clear explanations.
- Use the required Android foreground-service notification.
- Ensure foreground and background updates feed one deduplicated recording pipeline.
- Stop services when a run is saved or discarded.
- Explain interruptions caused by permissions, disabled GPS, or Android process termination.
- Validate this on a physical Android device; an emulator is not proof of real outdoor GPS accuracy.

### Save and history

A saved run must include at least:

- Unique local session/activity ID.
- Start/end timestamps and recording state.
- Active and paused segments.
- Accepted GPS samples and accuracy metadata.
- Distance, active duration, total elapsed duration, and pace metrics.
- GPS gaps/interruption information.
- Metric-calculation version.
- Save status.

The finish screen should show distance, active duration, elapsed duration, average pace, start date/time, and a GPS-gap notice if relevant. A route preview is optional and must never prevent saving. Support save, discard with confirmation, history, details, and deleting an individual activity with confirmation.

New guest activities must be isolated from historical account-owned data. Do not fabricate a signed-in user or expose old private records under guest mode.

## Authentication and planning features

The exact cloud provider must be determined from the repository; earlier discussion mentions Supabase and Firebase, but implementation must inspect the actual code rather than assume both are used.

Tracker-only mode should:

- Open directly to a Run screen, with History available.
- Avoid sign-in and onboarding routes.
- Prevent missing authentication environment variables from blocking startup.
- Avoid starting authentication listeners, sync jobs, plan generation, and plan notifications.
- Let a run save without a profile, user ID, plan, or scheduled workout.
- Preserve existing migrations and data without wiping databases.

Prefer conditional initialization and clear feature boundaries over commenting out large files. Keep old flows recoverable for a later product phase.

## Personalised-plan work: status and limitations

This work is deferred, not discarded.

The existing template model reportedly supports IDs/versions, goals, baseline requirements, frequency, availability patterns, phases, session purpose/effort, content/source metadata, time/distance targets, and some structural validation. Plan revisions retain template versions and saved prescriptions.

It was reported as only partially complete. Outstanding work includes:

- Structured warm-up, work, recovery, and cooldown steps.
- Easier and harder workout variants.
- Validation for variants, explicit weekly prescriptions, mixed units, and policy-specific progression/taper rules.
- A versioned catalog capable of resolving old template versions during replanning.
- Source-documented content reviewed for production use.
- Tests for those contracts.

Distance targets are currently unsupported by the plan scheduler and must not be silently converted into guessed durations. Runnable plans remain synthetic fixtures until reviewed training content and numerical policies exist.

## Competitor and research insights already gathered

Use original sources for future plan work. Do not claim access to competitors' proprietary recommendation algorithms.

- Runna documents a plan-realignment flow for missed workouts: users can skip, rearrange, or extend after missing meaningful training time. This is a product pattern, not a universal coaching rule. <https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature>
- Runna also documents deliberate skipping and managing missed runs. <https://support.runna.com/en/articles/15012850-how-and-when-to-skip-a-run-managing-missed-sessions-in-your-training-plan>
- Trenara describes adjusting recent load while preserving key intervals, changing endurance work where appropriate, assessing longer-term fitness, responding to repeated high perceived effort, and reassessing after pauses. Exact rules are proprietary. <https://www.trenara.com/blog/the-why-was-my-plan-adjusted-blog>
- Garmin Coach is a useful reference for adaptive-plan positioning, not a source for copying prescription logic. <https://www.garmin.com/en-AU/garmin-coach/overview/>
- Future content research should favour credible organisations and coaches, including BAA and NYRR. <https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/> <https://www.nyrr.org/train>
- TrainAsONE materials found so far do not disclose sufficient algorithm detail for implementation; retain that limitation.

## Technical baseline known from previous work

This is an Expo React Native TypeScript project using Expo Router, a local SQLite-style data layer, and package management with pnpm. Earlier repository review indicated deterministic TypeScript planning logic, local activity storage, and Supabase authentication, but all of this must be rechecked against the current checkout before changes.

The project uses a native development build rather than relying solely on Expo Go. Native dependencies or Android manifest/config changes require rebuilding and reinstalling the Android app. JavaScript-only screen changes normally need only Metro reload.

### Android development environment previously established

- Windows 10.
- Node.js 24.22.1 and npm 11.19.1 were installed.
- pnpm 12.15.0 was installed globally.
- Android SDK: `C:\Users\Lenovo\AppData\Local\Android\Sdk`.
- JDK 17: `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`.
- Android emulator device ID: `emulator-5554`.
- Physical Android device ID previously seen: `5d243b77`.
- `adb reverse tcp:8081 tcp:8081` was used for device/emulator access to local Metro.
- The project had Windows/Gradle path-length workarounds, including a `R:` drive mapping to `D:\Projects\AiSensei` and an `AI_SENSEI_PHYSICAL_ROOT` environment variable.
- The repository includes `scripts\build-android.ps1`; systems with PowerShell script execution restrictions can invoke it using `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1`.

Do not assume these values or workarounds are still current. Inspect scripts and current Android configuration before running or changing build commands.

## Known Android troubleshooting history

- Expo Doctor was eventually reported as passing all checks.
- Android emulator builds succeeded after resolving native build tooling and Ninja/CMake issues.
- Metro connection issues produced “Unable to load script” screens. `adb reverse`, checking `http://localhost:8081/status`, and force-stopping/reopening the app were used during diagnosis.
- A mismatch between emulator and phone ABI was encountered. Build/install only for the selected device architecture where necessary. An emulator is commonly x86_64 and a physical modern Android phone is commonly arm64-v8a.
- PowerShell parses an unquoted comma in a Gradle property as a parameter separator; quote values such as `"-PreactNativeArchitectures=x86_64,arm64-v8a"` when needed.
- Do not repeatedly wipe the database, clear all caches, or regenerate Android projects as default troubleshooting. Diagnose first and preserve user data.

## Validation requirements

Every tracker phase must separate what is verified from what is unverified:

1. Automated unit/integration tests.
2. Emulator validation.
3. Physical-device indoor validation.
4. Physical outdoor GPS validation.

The app building, installing, or opening is not sufficient evidence that tracking is accurate.

Test cases should include stationary recording, a known-distance route, out-and-back route, turns, slow running/walking, pause/resume, screen lock, temporary GPS loss, no internet, revoked permission, interruption/recovery, and repeated finish/save taps.

Before numerical tuning, define measurable acceptance targets for distance error on known routes, stationary drift, pace stability, battery use, background continuity, and recovery. Do not promise “Strava-level accuracy” without measured evidence. Another app can be a secondary comparison, but known-route and repeated-measurement evidence is stronger.

Raw route coordinates should not appear in ordinary diagnostics. Routes remain local by default; document what deleting a run removes.

## Future AI Run Sensei direction

Only begin once tracker data is trustworthy. The future Sensei should consume clean session events such as:

- Run started.
- GPS acquired/lost/recovered.
- Pace is persistently below a selected target.
- Milestone distance/time reached.
- Pause duration.
- Run finished.

It must not roast users for unreliable GPS, intentional walk intervals, pain, illness, or safety stops. Keep extension points clean, but do not add live AI/audio dependencies during tracker work.

## Working rules for the next implementation agent

1. Start with a current repository audit. Read project instructions, current progress documents, navigation, auth startup, storage schema, tracking code, and Android configuration.
2. Ask only questions that materially change the design, after the audit. The current defaults are Android, outdoor running, kilometres/min/km, no account, local-only data, manual pause, screen-lock tracking, and maps secondary to metrics.
3. Complete and validate one tracker phase before moving on.
4. Reuse sound code; do not rebuild everything by default.
5. Preserve unrelated uncommitted changes and existing user data.
6. Do not add cloud services, paid map services, authentication requirements, or new native dependencies without stating the dependency and why it is needed.
7. Run appropriate checks after each change and report exact evidence.
8. Explain clearly whether Metro reload is enough or a native Android rebuild is required.
9. Provide copy-pasteable PowerShell commands without `PS>` or `>>` prompt text.

## Definition of success for this product phase

A user can install/open AiSensei without creating an account, start an outdoor run, acquire GPS, lock the phone, pause and resume, finish, and see a locally saved result with credible distance, pace, and time.

Only then should the project resume AI roasts, training plans, onboarding, or cloud accounts.
