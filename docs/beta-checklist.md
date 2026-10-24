# Beta checklist and walkthrough

## Content gate

The only bundled plan and policy content is synthetic, `demoOnly`, and `draft`. It must not be released as real coaching. Original reviewed content and an approved adaptation policy remain release dependencies.

## Walkthrough

1. Complete onboarding and activate a supported demo preview.
2. Reopen offline and confirm Today/Plan load from local SQLite.
3. Record as-planned, partial, different-workout, and did-not-run facts; confirm History receipts keep unknown distance blank.
4. Open an adjustment preview; confirm reasons, constraints, and Keep-current availability.
5. Apply a valid proposal once, then repeat Apply and confirm no second revision.
6. Log another fact, retry the old preview, and confirm it is stale.
7. Reopen offline and confirm the active revision and history remain.
8. Enable reminders in a development/release-like build, deny permission once, then verify plan use remains normal. Verify changed/incompatible sessions cancel old reminders.
9. Prepare an export and verify prescriptions and actuals are distinct. Delete local data and verify app-owned reminders are cancelled.

## Device/accessibility matrix

Unverified on this Windows workstation: Android and iOS launch, large text, TalkBack/VoiceOver, keyboard/safe areas, reduced motion, permission denial on device, foreground/timezone reconciliation, and notification tap navigation. iOS requires macOS/Xcode. Do not mark these passed without device evidence.

## Feedback form

Ask beta participants: “Did you understand today’s plan?”, “Did the reason for a suggested change make sense?”, and “After a missed session, did you feel able to return?” Do not collect remote telemetry without a separate privacy and scope decision; local observation is sufficient for the initial beta.
