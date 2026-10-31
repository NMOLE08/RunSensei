# Outdoor GPS test checklist

Use this checklist on a physical Android phone. Record facts; do not adjust results to make the app pass. Raw coordinates are not needed.

## Test record

- Date and local time:
- Phone model:
- Android version:
- App build: release / development
- Weather and sky visibility:
- Route surface and obstructions:
- Independently known route distance and source:
- Battery before / after:

## Current implementation limits

- Keep the app open and the screen on. Screen-lock/background recording is not implemented yet and will pause the session.
- A development build needs Metro after a reload. Use the latest ARM64 release APK for a test away from the computer.
- GPS is mandatory. The clock must not start before a usable fix.
- Indoor walking is not a valid outdoor GPS accuracy test.

## Test A — startup and GPS acquisition

1. Go outdoors with a clear view of the sky and enable precise location.
2. Open RunSensei and confirm it opens Run without login or onboarding.
3. Select Run or Walk and tap **Find GPS and start**.
4. Confirm the button says **Acquiring GPS…** and the activity clock is not running yet.
5. Wait for the live recording screen.

Record:

- Seconds until recording began:
- Did the clock remain stopped while acquiring? yes / no
- Error message, if any:

Expected checkpoints in Settings → Workout checkpoints:

1. GPS permission requested
2. GPS permission granted
3. Waiting for a usable GPS fix
4. GPS signal received
5. Workout started

Failure guide:

- `Location services are off`: enable device location.
- `GPS permission denied`: allow precise location in Android settings.
- Acquisition never completes: move away from buildings/roof cover and retry.
- Clock starts before GPS is ready: lifecycle defect; stop the test and report it.

## Test B — stationary drift

1. After recording starts, remain still outdoors for two minutes.
2. Do not move the phone more than normal hand movement.
3. Record the displayed distance after two minutes.

Record:

- Stationary duration:
- Distance accumulated:
- GPS weak/lost message shown? yes / no

Evaluation target for this engineering test: no more than 0.02 km over two minutes. This is a provisional drift target, not an accuracy guarantee.

## Test C — known straight/out-and-back distance

1. Use a route with an independently measured distance, preferably at least 1 km total.
2. Walk or run normally, with the phone carried in its expected position.
3. Avoid manually pausing during this section.
4. At the known endpoint, record the displayed distance, active time, current pace, and average pace.
5. If possible, return on the same path and record the final values.

Record:

- Known one-way distance:
- App one-way distance:
- Known total distance:
- App total distance:
- Active time:
- Average pace:
- Current pace behavior: stable / delayed / spiky / unavailable
- GPS weak/lost periods and approximate duration:

Calculate distance error:

`absolute(app distance - known distance) / known distance × 100`

Initial evaluation target: within 5% on a clear, measured route of at least 1 km. This is a tuning target selected for the first field test, not a universal guarantee.

## Test D — turns and walking changes

1. Include several normal street turns.
2. Walk slowly for one minute, then return to normal pace.
3. Observe whether current pace responds gradually rather than jumping to impossible values.
4. Confirm average pace remains available once meaningful distance is recorded.

Record:

- Did turns lose obvious distance? yes / no
- Did current pace become unavailable? yes / no
- Largest implausible pace value observed:
- Approximate seconds for pace to respond to speed change:

The current pace window is 30 seconds, so delayed response is expected. Impossible spikes or persistent missing pace should be reported.

## Test E — manual pause and resume

1. Note distance and active time.
2. Tap **Pause** and remain still or walk around for one minute.
3. Confirm active time and distance do not increase.
4. Tap **Resume** and continue for at least 30–50 metres.
5. Confirm recording resumes without adding a straight-line jump across the pause.

Record:

- Distance before pause:
- Distance after pause:
- Active time before / after pause:
- Distance immediately after resume:
- Unexpected jump? yes / no

Expected checkpoints: Workout paused → Workout resumed.

## Test F — finish, local save, and restart

1. Tap **Finish and save** once.
2. Confirm the activity appears in History.
3. Note distance and duration shown in History.
4. Close and reopen the app without clearing data.
5. Confirm the activity still appears.
6. Do not test deletion until measurements have been copied.

Record:

- Finish required more than one tap? yes / no
- Appeared in History? yes / no
- Survived restart? yes / no
- History distance:
- History duration:

Expected checkpoint: Workout recording saved.

## Failure report to send back

Send:

1. The failed test letter and step number.
2. Screenshot of the live screen or History.
3. Settings → Workout checkpoints entries around the failure.
4. Known and recorded distance, active time, and average pace.
5. Whether the screen stayed on and the app stayed foregrounded.
6. Phone model, outdoor conditions, and whether precise location was enabled.

Do not send raw coordinates or a home address.
