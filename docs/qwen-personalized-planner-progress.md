# Qwen personalized weekly planner progress

Updated: 2026-10-31

## Truthful status

The production orchestration is implemented behind a reviewed-policy gate. On 2026-10-31, **Qwen3.5 2B downloaded, passed SHA-256 verification, loaded, and generated schema-valid JSON on the connected arm64 Android phone**, including once with Wi-Fi and mobile data disabled. A full diagnostic seven-day JSON proposal also passed. It did not and must not create a user workout plan because this repository has no qualified-coach-reviewed production numerical policy or workout rules.

## Automatic provisioning and transfer evidence

- Pinned endpoint: immutable revision `f6d5376be1edb4d416d56da11e5397a961aca8ae`, file size 1,280,835,840 bytes, SHA-256 `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223`.
- Endpoint probe on 2026-10-31: Hugging Face returned a 302 redirect to `us.aws.cdn.hf.co`, followed by `206 Partial Content`; `Accept-Ranges: bytes`, `Content-Range`, and stable ETag were present.
- Android configuration includes `INTERNET`; the test phone reported 17 GB free and validated unmetered Wi-Fi.
- Root cause established in app code: the previous one-shot `FileSystemDownloadTask` deleted `.part` before every attempt and had no persisted recovery state. The socket abort itself was transient; available evidence does not identify a bad URL, storage failure, or missing Android permission as its source.
- Replacement: 8 MiB HTTP range chunks, strict `206`/`Content-Range`/ETag validation, five attempts per chunk with exponential backoff, checkpoint JSON after each committed chunk, temporary `.part`, native SHA-256, then atomic promotion.
- Physical evidence: automatic Wi-Fi setup reached 304 MiB, paused without deleting data, and after force-stop/relaunch resumed from 318,767,104 bytes to 352,321,536 bytes. Duplicate starts are guarded by `LocalModelManager`.
- Mobile data requires explicit approval. Onboarding and GPS remain available while the model provisions.
- The full 1,280,835,840-byte download completed; its temporary file and checkpoint were removed only after native SHA-256 verification and atomic promotion to the verified path.
- Cold launch after the verified file existed automatically reached **AI coach ready in 8.8 seconds** (app launch, integrity inspection, and local initialization combined).
- Physical inference results: readiness JSON passed in 6.3 seconds (140 prompt tokens / 4,921.724 ms, 13 generated tokens / 1,319.097 ms); the complete seven-day schema diagnostic passed in 85.9 seconds (998 generated tokens / 75,701.707 ms); the readiness JSON also passed offline in 7.8 seconds after both Wi-Fi and mobile data were disabled.
- The Qwen/llama.cpp response occasionally begins with the exact ChatML marker `<|im_start|>assistant`. `extractStructuredJsonText` now permits that protocol marker, complete leading `<think>…</think>` blocks, or one complete Markdown JSON fence, then requires one balanced JSON value with no trailing content. It never repairs malformed model output.
- Android `dumpsys meminfo` observed about 1,345,840 KB total PSS / 1,402,864 KB RSS after load (pre-load during download: about 546,416 KB PSS / 701,732 KB RSS). This is a single-device observation, not a device-compatibility guarantee.

The repository still has no qualified-coach-reviewed production numerical policy or workout rules. Therefore the actual app must return generation unavailable rather than use the test policy or silently substitute the deterministic demo fixture.

## Implemented technical path

1. `RunnerProfileBuilder` creates a strict allowlisted profile from onboarding, four source-tagged weeks, RunSensei-native runs, and recorded outcomes. Strava provenance is rejected recursively.
2. `personalizedWeeklyPlanner` builds one seven-day request, retaining long-term goal, phase, week number, recent load, outcomes, availability, preferences, and reliable pace-evidence status.
3. `LocalWeeklyPlanGenerationService` invokes the injected Qwen provider and performs one bounded repair attempt. It never calls the deterministic demo generator on failure.
4. Qwen may construct workout type, bounded duration/distance, explicit repetitions, warm-up/main/recovery/walk/cooldown steps, effort cue, purpose, and explanation only inside a versioned reviewed policy.
5. `validatePersonalizedWeeklyPlan` independently checks exactly seven consecutive dates, approved rule IDs/types, numerical ranges and increments, repeated-step totals, day limits, unavailable dates, weekly load, frequency, recovery spacing, long-run count, and pace-evidence requirements.
6. `acceptPersonalizedWeek` revalidates the unchanged profile fingerprint and policy version, then atomically saves the active plan/revision/assignments through `TrainingRepository`. Raw generated JSON and generator/model/prompt/policy/validation metadata are stored in revision explanation JSON. Repeated acceptance is idempotent.
7. Plan UI distinguishes `qwen3.5-2b`, `deterministic_demo`, and unavailable/legacy generation metadata.
8. `WorkoutAdaptationService` can ask one missed-workout question. Proposed moves are rejected if they modify completed work, use unsupported rules, choose unavailable dates, stack workouts, or violate recovery spacing.
9. Week 2 uses Week 1 actual outcomes in the next request and still produces exactly seven dates only.

## Test-only policy boundary

Automated integration uses an explicitly synthetic test fixture to prove provider invocation, parsing, validation, acceptance, SQLite mapping, metadata persistence, and idempotence. It is not bundled as production coaching policy and cannot make real activation available.

## Physical verification completed and remaining

Completed on one physical arm64 Android phone: automatic provisioning, pause/resume after force-stop, byte-range recovery, SHA-256 verification, atomic promotion, CPU model initialization, cold-launch auto-initialization, readiness schema JSON, complete seven-day schema JSON, and inference with Wi-Fi/mobile data disabled.

Still required before real coaching release:

1. A qualified review of numerical policy and workout rules. This is the current hard release dependency.
2. Once that content exists, run three substantially different synthetic profiles through the actual `LocalWeeklyPlanGenerationService`, retain privacy-safe prompt/JSON/validation evidence, accept one preview, and confirm it appears in Today/Plan after restart.
3. Test low-memory behavior, cancellation, battery/thermal impact, an additional Android device class, and iOS (currently unverified).

Until reviewed policy exists, report the real-workout generator as `unavailable` and do not claim that Qwen is producing the user's workout plan.

## Policy-catalog engineering (2026-10-31)

`policyReviewCatalog.ts` now contains immutable, exact-version review packages for beginner walk/run, first/recreational 5K, first 10K, half-marathon completion/improvement, and marathon completion. Every bundled package is explicitly `draft`, has no numerical formula, and is activation-blocked. The on-device generation application entry point now requires a matching release-ready review package in addition to its reviewed runtime policy, so a caller cannot label an unrelated policy as approved.

The source register, missing-policy inventory, numerical-rule authoring worksheet, and reviewer checklist are in `docs/training-policy-review-package.md`. This completes the safe engineering framework, not the professional content review. The next required external action is a qualified coach authoring and signing a new immutable policy/template version with rights-cleared original prescriptions.

## Draft beginner-to-5K candidate (2026-10-31)

`beginner5kCandidate.ts` now contains original, numerically specified candidate stages, complete warm-up/main/walk/cooldown structures, explicit three-session/week and long-session limits, one whole rest day between scheduled sessions, a non-increasing week-four stage, RPE-only effort guidance, fixed-date boundary, no-catch-up handling, and health/interruption exits. It is `beginner-to-5k-candidate@0.1.0-draft`, never reviewed, and cannot be activated or persisted as a real plan.

`candidateBeginner5kPlanner.ts` lets the actual Qwen orchestration generate a clearly labelled development preview inside those deterministic bounds. `acceptPersonalizedWeek` rejects it before SQLite activation. Automated mock-provider integration verifies profile-dependent bounded policy input, structured response validation, draft metadata, unavailable baseline behavior, and no fallback plan. A physical Android sample button is available on the local-model diagnostics screen; it was not rerun after this feature because the previously connected phone was disconnected from ADB.
