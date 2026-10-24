# Phase 1 verification record

Recorded 2026-10-22.

## Selected versions

The project uses Expo SDK 58, created from Expo's current `default@sdk-58` guidance. Resolved application packages are recorded in `pnpm-lock.yaml`:

| Package | Resolved version |
| --- | --- |
| expo | 58.0.16 |
| expo-router | 58.0.25 |
| expo-status-bar | 58.0.4 |
| react | 19.3.0 |
| react-native | 0.88.0 |
| eslint-config-expo | 58.0.4 |
| jest-expo | 58.0.11 |
| TypeScript | 5.9.x (pinned to `~5.9.3`) |
| expo-doctor | 1.21.5 |

## Environment and checks

- Windows workstation; Node 24.19.0 and pnpm 11.25.0.
- Android Studio was found at `D:\Android\Android Studio`; no emulator/device build was run in Phase 1.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed. The Jest smoke suite contains two calendar-date assertions.
- `pnpm run doctor` ran Expo Doctor's 20 checks but could not complete four environment-dependent checks: three dependency-tree checks cannot run because this Node runtime has no `npm` executable, and the Expo config-schema check cannot reach the Expo API (`connect EACCES`). It also warned that bundled native modules could not be fetched. These are unresolved environment findings, not a claim of a clean Doctor report.
- `pnpm start --offline` recognized the project and Expo Router's `src/app` root, but Metro did not reach a ready server: React Native DevTools could not create its user-profile `dotslash` directory because of access denial. No launch is claimed from this check.

## Platform status

No Android emulator, physical Android device, iOS simulator, or iOS device has been launched for this phase. iOS cannot be verified from this Windows workstation. Android launch remains the next manual verification step after resolving the local profile permission for React Native DevTools (or using an environment where it is writable).
