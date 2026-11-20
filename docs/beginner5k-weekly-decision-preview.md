# Beginner 5K weekly decision preview — Stage D milestone 1

Internal research only. `researchOnly: true`, `productionEligible: false`.
Software validation is not coaching approval. No policy numbers or saved assignments are changed.

## Supported route

The preview uses `runsensei.foundation.multiweek@0.2.0-draft` for the immediate foundation phase while retaining the 5K goal. It does not merge or substitute the fixed 12-week beginner programs.

Initial preview: locally saved onboarding → matching account-owned assessment → normalized evidence → exact foundation policy lookup → existing generator/scheduler → independent full-block validation → one selected week.

Saved-block preview: all historical corrections → current outcome versions → existing System D analysis and `runsensei.foundation.block_reassessment@0.1.0-draft` → newly confirmed capability → next foundation candidate. All assigned workouts and required feedback must satisfy that policy. One completed week, absent feedback, or elapsed calendar time cannot authorize progression. Repetition, reduction and race-preparation transitions remain policy gaps where unauthored.

## Evidence and concurrency

- Historical longest sessions remain historical; they are not compared to an average weekly total as if both measured the same thing.
- Actual running duration must be explicitly reported. GPS active elapsed time and guided phase timing do not prove running time.
- Source IDs, units, observation windows, timezone, reliability, corrections and unreported assignments remain visible in the audit output.
- The canonical assessment fingerprint is reused. Draft `updatedAt` changes do not become evidence changes.
- Reads are account-scoped. The service reads twice and compares revisions, then rechecks the authenticated owner. Changed evidence returns a retry result rather than a mixed preview.
- The service performs local reads only: no migration, remote fallback, reassessment-decision save, activity creation, assignment replacement or publication.
- The audit fingerprint is a canonical JSON revision identity, not a cryptographic signature or authorization token.

## Calculation example (synthetic)

Confirmed current weekly running: 3,000 seconds; continuous capability: 2,700 seconds; explicitly selected frequency: three; Tuesday/Thursday/Sunday available with confirmed 45-minute limits; start Monday 2027-01-04.

Week 1 contains Tuesday January 5, Thursday January 7 and Sunday January 10:

| Each workout component | Seconds |
|---|---:|
| Walking warm-up | 300 |
| Conversational running | 1,000 |
| Walking cooldown | 300 |
| Full session | 1,600 |

Weekly running = 3,000 seconds (50 minutes). Walking = 1,800 seconds (30 minutes). Scheduled total = 4,800 seconds (80 minutes). These are outputs of existing draft rules, not newly approved prescriptions.

The entire four-week block is validated even though only the selected week is displayed. Later stages remain conditional research illustrations. The saved requested start date is preserved; viewing a preview does not move it to today.

## Android check

1. Use the existing internal research build, or development build with `EXPO_PUBLIC_EXPERIMENTAL_5K_PREVIEW=true`. Authenticate with the intended account.
2. For a supported 5K foundation profile, open Plan / Research Foundation. Expand **Beginner 5K decision preview** and select week 1. Tap **Check weekly decision**.
3. Check the running/walking totals, dated workouts, exact steps and visible research restriction. Expand **Decision evidence and rules** for source values, System D facts, rule references and validation.
4. With a saved block selected, provide the proposed next start date. An incomplete block must return an evidence/policy gap, not silently replace assignments. Completed synthetic scenarios are tested automatically; do not fabricate real workout completion on the phone.
5. Switch accounts and verify the previous result disappears. Reopening or checking a preview must not add a block, activity or production plan.

Physical-device rendering and navigation have not been verified for this milestone. No Gradle build is required for automated verification; rebuild locally when ready for Android testing.

## Implementation boundaries

- `src/domain/planning/beginner5kRunnerEvidence.ts`: normalized evidence and correction lineage.
- `src/domain/planning/beginner5kWeeklyDecision.ts`: deterministic calculation, existing reassessment and audit trace.
- `src/application/beginner5kWeeklyPreview.ts`: account-owned local reads and revision checks.
- `src/features/execution/Beginner5kWeeklyPreview.tsx`: read-only panel in `ResearchFoundationProgress.tsx`.
- Existing `currentInputs()` mapper is exported from `src/application/researchFoundation.ts`; its logic is unchanged.

No audio, GPS, guided execution, training policy, authentication, schema, package ID or signing changes belong to this milestone.

## Automated verification

- `pnpm.cmd exec tsc --noEmit`: passed.
- ESLint on all milestone source and test files: passed without warnings.
- `pnpm.cmd exec jest --runInBand`: 90 suites, 491 tests passed.
- `python PolicyPack/foundation/validate_foundation.py`: passed.
- `python PolicyPack/foundation/validate_reassessment.py`: passed.
- `python PolicyPack/validate_policy_pack.py`: passed, including the unchanged fixed 12-week pack.

New tests:

- `tests/domain/beginner5kWeeklyDecision.test.ts`
- `tests/application/beginner5kWeeklyPreview.test.ts`
- `tests/application/beginner5kWeeklyPreviewIntegration.test.ts`
- `tests/features/beginner5kWeeklyPreview.test.ts`

The integration test uses the real onboarding mapper, assessment repository and generator against an in-memory database. It asserts zero preview writes. UI tests inspect component output; they do not establish physical Android behavior. No Gradle build or device testing was performed.
