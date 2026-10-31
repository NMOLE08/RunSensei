# Qwen3.5 2B on-device migration

Updated: 2026-10-31

## Current outcome

RunSensei now has an optional, provider-independent local inference path backed by `llama.rn` and a pinned Qwen3.5 2B Q4_K_M GGUF. Cloud Gemini generation is disabled and retained only as rollback evidence until real on-device generation is verified. GPS recording, authentication, plans, and workout history do not depend on the model.

The technical framework is implemented and its Android native build has been verified. A real model download, load, and prompt on the physical phone are still unverified because the optional 1.28 GB download has not been initiated. Production weekly coaching remains blocked by the absence of reviewed numerical training policy and reviewed workout content.

## Compatibility audit

- Expo `58.0.17`, React Native `0.88.0`, Hermes, and New Architecture are enabled.
- Runtime: pinned `llama.rn 0.13.0-rc.6`; this release supports the New Architecture and structured JSON-schema output.
- Android target tested: OPPO CPH2691, Android 16, `arm64-v8a`, approximately 11.5 GB total RAM reported by Android.
- CPU inference is used first. Android builds include only `rnllama` and `rnllama_v8_2_dotprod_i8mm` plus their JNI bridges. OpenCL and Hexagon are excluded.
- iOS local inference is not built or tested on this Windows workstation.

## Model manifest

- Source: `unsloth/Qwen3.5-2B-GGUF`
- Source revision: `f6d5376be1edb4d416d56da11e5397a961aca8ae`
- File: `Qwen3.5-2B-Q4_K_M.gguf`
- Size: `1,280,835,840` bytes
- SHA-256: `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223`
- License recorded by the source: Apache-2.0
- Storage check: model size plus 512 MiB headroom.

The file is downloaded to app-private storage only after the user chooses to download it. A `.part` file is used during transfer, then size and SHA-256 are checked before the file becomes available. Cancellation, retry, corrupt-file removal, model release, and deletion are supported. The model is not in Git.

## Implemented phases

### Phase 1 — audit: implemented and tested

- Existing Gemini Edge code, prompts, policies, SQLite, onboarding, GPS, and dirty working tree were inspected.
- Gemini execution is disabled by `weeklyAiPlannerEnabled = false`; no mobile API key or cloud fallback was added.
- Existing user data is preserved through additive migration 12.

### Phase 2 — native feasibility: implemented, partially verified

- Native arm64 debug build succeeded in 29m 30s after limiting compilation to two CPU variants.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 110,547,270 bytes.
- APK inspection found only four expected AI libraries: `librnllama.so`, `librnllama_jni.so`, `librnllama_v8_2_dotprod_i8mm.so`, and its JNI bridge.
- The APK installed successfully over the existing phone app without clearing data. The app became the top resumed activity with no startup React Native or Android runtime error.
- Model download/load/offline prompt, latency, memory, battery, and thermal behavior: **not yet verified**.

### Phase 3 — structured inference: implemented and unit tested

- Provider-independent file/runtime contracts and one-operation-at-a-time manager.
- CPU-only llama context (`n_ctx=4096`, four threads, no GPU layers).
- Strict JSON schema, streaming callback, cancellation, bounded one-repair retry, and deterministic validation.
- Versioned system prompt prohibits database writes, Strava data, fabricated facts, medical advice, catch-up debt, and modification of completed work.

### Phase 4 — runner profile: implemented and unit tested

- Uses onboarding facts and account-scoped RunSensei-native saved runs.
- Calculates recent native run count, weekly distance, longest distance, and active-time average pace only when inputs support them.
- Missing values remain `null`; walks are not treated as running stimulus; Strava is explicitly excluded; raw GPS points and identity fields are not sent to inference.

### Phase 5 — one-week generation: technical framework implemented

- Output must contain exactly seven consecutive local dates.
- The model can only select exact allowlisted, reviewed workout templates. It cannot edit their duration, intensity, or steps.
- Availability, per-day time, frequency, weekly minutes, rest structure, and step totals are validated deterministically.
- Generation refuses unreviewed policy. The repository currently has demo/research content only, so production generation is intentionally unavailable.

### Phase 6 — adaptation: service implemented and unit tested

- Supports one-question actions, no-change, proposed future revisions, and health hold.
- Health concerns bypass inference and preserve the safety pathway.
- Completed-session edits and unknown workout templates are rejected.
- The service never writes the database. Existing transactional proposal/review/apply screens remain the only persistence boundary.
- A production AI-driven revision remains blocked until reviewed rules exist.

### Phase 7 — persistence and UI: implemented with limitations

- Settings links to a model-management screen with download, progress, cancellation, verification, loading, smoke test, and removal states.
- Migration 12 adds model-installation and bounded conversation-state tables without resetting data.
- Export and deletion include AI-owned records.
- Existing Today, Plan, workout feedback, plan review, reminders, and history remain connected to the deterministic persisted plan loop.
- A general-purpose AI chat surface is not released while it cannot safely apply reviewed coaching decisions.

### Phase 8 — physical Android validation: partial

- Build, install, bundle startup, ABI, and native library contents verified on the connected OPPO phone.
- The 1.28 GB model has not been downloaded, so initialization time, token speed, peak memory, UI responsiveness, offline response, battery impact, and coaching-output comparison are unverified.

## Automated verification

- TypeScript: passed (`tsc --noEmit`).
- ESLint: passed.
- Jest: 31 suites, 120 tests passed.
- Android arm64 debug build: passed.
- Expo Doctor: 18/20 checks passed. It reports the existing checked-in-native/app.json synchronization warning and 13 Expo SDK 58 patch-version mismatches. These unrelated package upgrades were not mixed into the migration.

## Manual model test

1. Install the arm64 development APK and start Metro.
2. Open Settings → Manage local AI model.
3. Confirm at least approximately 1.7 GB is free, then choose Download.
4. Verify progress can be cancelled and restarted.
5. After SHA verification, load the model and run the offline test.
6. Enable airplane mode after the model is ready and repeat the test.
7. Record load time, tokens/second, total latency, Android memory, battery change, temperature, and any UI stall or crash.
8. Confirm GPS recording still starts and saves when the model is absent or unloaded.

## Remaining release blockers

- Physical model load/inference evidence.
- Reviewed production workout templates and versioned numerical training policy.
- Coaching-quality comparison against reviewed example weeks.
- iOS build and device verification.
- A final decision to delete the retired Gemini rollback code after local inference is proven operational.

## Android commands

```powershell
cd D:\Projects\AiSensei
pnpm.cmd install
node .\node_modules\llama.rn\install\download-native-artifacts.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Architecture arm64-v8a

$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$phoneId = "5d243b77"
& $adbPath -s $phoneId install -r -d .\android\app\build\outputs\apk\debug\app-debug.apk
& $adbPath -s $phoneId reverse tcp:8081 tcp:8081
pnpm.cmd exec expo start --dev-client --port 8081
```

`llama.rn` is a native dependency, so a new development/release build is required. Metro reload alone is sufficient only for later JavaScript changes.
