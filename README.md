# AiSensei

The optional on-device Qwen3.5 2B migration is documented in [docs/qwen-on-device-progress.md](docs/qwen-on-device-progress.md). The model runs through `llama.rn` after a user-initiated download; GPS tracking remains independent. Cloud Gemini generation is disabled and retained temporarily as rollback evidence.

AiSensei is an offline-first running-plan prototype with a persisted workout-feedback and immutable plan-review loop. The only bundled training content remains synthetic demo content; reviewed original content is still required for real coaching release.

## Selected stack

- Expo SDK 58 (`expo ~58.0.0`), selected from Expo's current stable template guidance on 2026-10-22.
- React Native, React, and Expo Router versions are installed by `expo install` so they match SDK 58 exactly; the resolved versions are recorded in `docs/phase-1-verification.md` and the lockfile.
- TypeScript strict mode, ESLint with Expo's flat config, and Jest through `jest-expo`.

## Commands

```powershell
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm run doctor
```

## Android development build

This Windows project needs Node.js, pnpm, JDK 17, Android SDK build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1, and Ninja. The build script checks these before invoking Gradle. Start an x86_64 emulator in Android Studio's Device Manager, then run:

```powershell
cd D:\Projects\AiSensei
.\scripts\build-android.ps1 -Install
```

The script temporarily maps `R:` to the project and builds through that short path. This avoids Windows' 260-character limit on generated C++ object names. If `R:` is already used, pass another free letter with `-DriveLetter T`. Omit `-Install` to produce the APK without installing it. The APK is at `android\app\build\outputs\apk\debug\app-debug.apk`.

For live JavaScript development, keep Metro running in another terminal:

```powershell
pnpm.cmd exec expo start --dev-client --port 8081
```

Open AiSensei on the emulator. If it cannot reach Metro, run `adb reverse tcp:8081 tcp:8081`. JavaScript edits use Metro reload; rerun the native build script when native packages or Android configuration change. Expo prebuild can regenerate `android/settings.gradle` and `android/build.gradle`, so keep the short-path hooks in those files when regenerating the native project.

## iOS development build

iOS builds require macOS with Xcode and CocoaPods. On that machine, install project dependencies, run `npx expo prebuild --platform ios` when native generation is needed, then run `npx expo run:ios`. This Windows workstation has not been used to test iOS.

## Project layout

- `src/app`: Expo Router route files only.
- `src/domain`: pure business/calendar code.
- `src/design`: reusable visual primitives, tokens, and development fixtures.
- `src/domain`: pure calendar, unit, context, and training-entity contracts.
- `src/domain/training`: content contracts, deterministic preview generation, and constraints. The bundled content is explicitly demo-only.
- `src/application`: transactional use-case boundaries.
- `src/data`: Expo SQLite adapter, versioned migrations, and repositories—the sole durable plan store.
- `src/features/execution`: active-plan reader and presentation-only view models for the persisted execution views.
- `tests`: unit tests.

The Phase 2 component system lives in `src/design`. Local Inter, IBM Plex Mono, and Pixelify Sans assets—and their OFL notices—are kept in `assets/fonts/`. Fixture content is visibly labelled and is not a personalised recommendation.

See [the implementation plan](docs/half-marathon-implementation-plan.md) and the Phase 0 contracts under `docs/` for project scope and content-release requirements.

See [workout feedback and personalization](docs/feedback-loop-and-personalization.md) for the outcome → reassessment → review → activation flow, schema migration 8, unsupported states, fixture limitations, manual verification, and future strength/nutrition/AI integration boundaries.
# Google sign-in setup

Google sign-in requires the Google provider to be enabled in Supabase Authentication. Configure a Google OAuth web client in Google Cloud, add `https://simzbjtoyxvdswasccid.supabase.co/auth/v1/callback` as its authorized redirect URI, and enter its client ID and secret into Supabase's Google provider settings. Add `aisensei://auth/callback` to Supabase Authentication's redirect URL allow list. Google Cloud consent-screen publishing or test-user restrictions may also apply. Keep the client secret in Supabase, never in the app or repository.

On 2026-10-26 the project's public authentication settings initially reported the Google provider disabled; a later check confirmed it enabled. The redirect allow list and Google Cloud configuration have not been independently verified. An updated release APK is required before testing. The callback accepts Supabase implicit token redirects and PKCE code redirects; neither has been verified end to end on a physical phone.
