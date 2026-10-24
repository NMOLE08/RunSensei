# AiSensei

AiSensei is an offline-first, first-half-marathon completion planner. Phases 9–10 add constrained immutable revision activation, local reminder reconciliation, and local data controls. The only bundled training content remains synthetic demo content; reviewed original content is still required for real coaching release.

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
