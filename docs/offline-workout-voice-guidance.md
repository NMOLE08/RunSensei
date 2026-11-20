# Torto offline workout voice guidance (internal research feature)

## What the implementation does

Guided workout progress remains authoritative. The foreground screen and the existing GPS TaskManager reconciliation both read the persisted tracker session and guided-progress snapshot; neither voice path owns a workout clock. A phase change can create one session-scoped cue identity. A timed phase may create one countdown identity when active elapsed time crosses the configured 10-second boundary. Untimed and distance-only phases never get a duration countdown.

Version 1 uses Expo Speech and the Android device's generic text-to-speech voice. The provider interface reserves `moss` and `jett` for future local voice packs; the current voice is not either character. No speech text is sent to a service, and no LLM is called. The native TTS engine and selected voice determine whether speech can work without internet; Torto does not guarantee that a device voice is offline-capable.

## Receipts and delivery meaning

The additive SQLite migration stores preferences by account and cue receipts by account, GPS session and stable event ID. Receipt states distinguish a claim, a playback attempt, native completion callback, failure, suppression, and supersession. The atomic SQLite key prevents two foreground/background callers from claiming the same cue. After process restart, unfinished receipts are marked failed and are not replayed. If several phases elapsed while suspended, only the currently relevant phase is eligible for speech; intermediate phase cues are marked stale.

`playback_completed` means the native speech API reported completion. Even that callback cannot prove that the runner heard or understood the announcement. A `playback_attempted` receipt only proves Torto invoked the provider. Speech errors are non-fatal and must not affect GPS point persistence, workout completion, feedback, or History.

## Limits not yet verified on a device

- Headless or screen-locked speech from the TaskManager callback is experimental and may be unavailable or stopped by Android.
- Android's installed text-to-speech engine/voice may need a download or network access; offline speech depends on device settings and voice package.
- Android may pause or interrupt TTS due to other audio, battery policy, process termination, or system voice changes.
- No physical-device, offline-voice, or locked-screen speech verification has been performed in this implementation task.

## Indoor Android verification

1. Build and install the internal development APK using the existing local Windows build script; keep the package ID and signing key unchanged. A native dependency was added, so a JavaScript reload alone is insufficient.
2. Open a saved research workout, enable **Voice guidance**, leave **10-second countdown** off, and start the workout. Confirm a generic device voice announces the start. Confirm the first phase and subsequent phase transitions are announced once.
3. Enable countdown, start a timed phase longer than 10 seconds, and wait for the 10-second cue. Confirm no countdown is offered for the final untimed/distance event.
4. Pause and resume. Confirm each successful action is announced; toggle mute during speech and confirm it stops. Confirm the screen controls still work if Android TTS is unavailable.
5. Move Torto to the background or lock the screen briefly during a timed phase, then return. Confirm GPS/progress is intact and only the current phase is announced; no old announcements replay. Repeat with the device offline only after confirming an offline voice is installed in Android's TTS settings.
6. Finish a workout and confirm old cues stop before a completion cue when the authored phases are complete. Verify Finish → Feedback → History and GPS distance remain intact whether speech is enabled, muted, or unavailable.

Use a short indoor route or stationary checks for voice/UI behavior only; indoor GPS distance is not an accuracy test.
