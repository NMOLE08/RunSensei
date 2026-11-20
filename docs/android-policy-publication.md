# Android authorization and authenticated Week 1 publication

## Status

Application integration is implemented, but **real publication remains disabled**. The bundled root list is empty and the authorization endpoint is null. No reviewer identity, approval or private key was invented. No policy JSON, workout prescription, package ID, signing configuration, GPS behavior or database schema was changed in this milestone. Week 2 is still unsupported.

This document supplements `beginner5k-publication-integration.md`. That document's 108-suite results describe the preceding milestone, not Android verification.

## Android cryptography

`modules/torto-release-crypto` is a local Expo module, discovered by the installed SDK 58 autolinker. It uses Android JCA:

- SHA-256 over UTF-8 bytes.
- RSA public keys encoded as DER SubjectPublicKeyInfo, represented as hex; at least 2048 bits.
- RSA-PSS: SHA-256, MGF1 SHA-256, 32-byte salt, trailer field 1, explicitly set rather than relying on provider defaults.
- SecureRandom for a fresh 32-byte request nonce.

`src/services/security/releaseCrypto.ts` always selects the native module on Android. A missing module or provider failure rejects verification. There is no Android JavaScript crypto fallback. Other platforms use standard WebCrypto when available and fail closed otherwise. iOS native support is not implemented here.

Expo autolinking discovery was executed successfully. TypeScript/Jest do not compile Kotlin. Android instrumentation coverage is supplied in `modules/torto-release-crypto/android/src/androidTest/java/expo/modules/tortoreleasecrypto/ReleaseCryptoTest.kt`; it generates transient test keys on the device, checks a known digest, a valid signature, tampering and a wrong key. It has NOT been run. The private test keys are neither production assets nor persistent keys. Android bridge dispatch and missing-module behavior have separate mocked Jest coverage.

References: [Expo local modules](https://docs.expo.dev/modules/get-started/), [module registration](https://docs.expo.dev/modules/module-config/), [Android explicit PSS parameters](https://developer.android.com/reference/java/security/spec/PSSParameterSpec).

## Trust-anchor enrollment and rotation

1. An accountable release administrator must establish the real trust-root public key and validate its fingerprint out of band. Retain the private root key outside the app and repository.
2. Review a change to `src/config/policyAuthorization.ts` adding the public SPKI hex, unique root ID, root version and revocation status, plus the real HTTPS service endpoint. Deploy through the existing signed application release process. Environment flags, onboarding answers and downloaded manifests cannot enroll roots.
3. The administrator enrolls qualified reviewers in a root-signed roster. Each reviewer record has `id`, `version`, `spkiHex`, `reviewer`, `scopes`, exact `references`, and explicit `revoked`. Scope is restricted to `initial_week_publication` or `workload_compatibility`; no wildcard policy references are accepted by the approval verifier.
4. Reviewers sign the exact `torto-policy-release-v1` approvals described in the previous document. They cover every dependency returned by `requiredBeginner5kPublicationReferences`, including the selected pathway and compatibility successor. Approval for one pack/version does not release another.
5. Implement the external authorization service. It receives `{schema: 'torto-authorization-request-v1', nonce, applicationId: 'com.aisensei.app'}` and returns `{keyId, payload, signatureHex}`. `payload` is the exact UTF-8 JSON string signed by the pinned root; do not reserialize it before signature verification. No account credentials or runner evidence are sent in this request.

The payload contract is `ReleaseTrustPayload` in `src/services/security/releaseTrust.ts`:

```text
schema: torto-release-trust-v1
version: monotonically increasing positive integer
issuedAt / expiresAt: ISO timestamps
requestNonce: exact challenge from this request
keys: versioned reviewer records
revokedArtifactIds: explicit array, including [] when none are revoked
approvals: signed reviewer approval envelopes
```

The backend is an operational prerequisite; this milestone implements its client, not a deployed signing service. Do not put private signing material in the client, Supabase client configuration, or chat.

Roster changes require a higher roster version. Changed key material/identity/scope needs a higher key version or a new ID. SecureStore retains the highest roster version, roster digest, reviewer version history, and cumulative artifact revocations. Same-version roster changes, rollback, revival of a revoked key ID, and removal of known artifact revocations are rejected. Omission removes a key from the current trusted roster without deleting its history. An explicitly revoked ID cannot be reused; issue a new ID for its replacement.

Root rotation is a reviewed application update: pin the replacement root, then retire/revoke the old root in a later signed build. This client does not implement remote self-authorized root rotation. Retiring a compromised root across already-installed old builds requires an operational update/release policy; do not claim immediate fleet-wide revocation.

## Freshness, revocation and offline behavior

New publication always requests fresh, nonce-bound authorization. There is no cached-approval publication mode. Missing revocation data, revoked keys/artifacts, invalid/expired approvals, network errors and unavailable crypto all block publication. Existing saved workouts remain readable offline through the existing account-owned history/active-plan reads; those reads do not need this service.

The engineering clock tolerance is five minutes and the request timeout is 15 seconds. These are security settings, not coaching thresholds. The root's issued time must agree with the device within the tolerance. A verified capability expires no later than the server expiry, issued time plus tolerance, or verification time plus tolerance. Moving the clock behind its verification time invalidates it. Commit checks also enforce reviewer approval expiry. Large clock disagreement requires correcting the device clock; it is not a reason to redo onboarding.

Before/during the transaction the client rechecks the current secure roster version. A newer roster invalidates an older in-flight capability. Revocation published after the last received snapshot is not magically observable: the service must publish updates promptly, and the bounded validity window is a security review decision. SecureStore loss/reinstall removes local anti-rollback history; the nonce-bound online service must never serve an obsolete roster. SecureStore failure or excessive roster size fails closed; test practical storage sizes before operating a large roster.

## Authenticated execution

`getCurrentBeginner5kPublicationStatus()` and `publishCurrentBeginner5kWeekOne()` in `src/application/currentBeginner5kPublication.ts` accept no caller-supplied account, runner facts, trust keys, approvals or test-policy switch.

1. Acquire a Supabase session lease and auth-change listener independent of mounted UI.
2. Load account-owned draft and matching assessment through `loadCurrentAccountPlanFacts`.
3. Regenerate the existing 36-session preview without altering its strict selector result.
4. Obtain root-signed trust and verify every exact dependency and artifact digest.
5. Check the existing publication-compatibility successor using real saved evidence.
6. For an explicit action only, invoke `publishBeginner5kInitialWeek` and independent full-pack validation, then persist three Week 1 assignments atomically with their revision, provenance and audit.
7. Check account lease, evidence fingerprint, roster version and authorization expiry before writes and before commit. Reload the saved week; return `plan_ready` only for the persisted authorized result.

The auth listener cancels when switching away, even if the same account later returns. Account expiry/logout or a changed draft causes a conflict; no stale old-account preview is returned. Failures before the final transaction guard roll back. A logout after the final guard/commit cannot undo a committed week; it remains owned by the original account and is not exposed to the new account. This is the commit boundary, not a promise of global atomicity with Supabase logout.

Concurrent retries use the existing durable plan identity and SQLite exclusive transaction. No new migration or replacement of existing assignments was introduced. The application status read never publishes. `openPlanAvailability` consumes the typed status; existing card routing uses its precise recovery when available. No new activation button or UI redesign was added—Luna can wire the eventual explicit action using `canPublish`, while the action itself always revalidates.

## User blockers versus internal blockers

- Missing known runner fields carry the field and existing focused onboarding route.
- Missing health answers differ from a positive reported health concern.
- Stale assessment/interruption returns reassessment; unsupported capability/pathway remains unsupported.
- Missing enrollment/approvals stays internal (`policy_approval_pending`); crypto/network/trust errors return authorization failure.
- Changed evidence/account/revision returns publication conflict; SQLite failure returns persistence failure.
- Neither missing reviewer signatures nor missing revocation metadata sends the runner through onboarding.

One existing onboarding limitation remains: the 5K production compatibility successor requires `weeklyEvidenceConfirmedAt` and `currentCapabilityConfirmedAt`, while the explicit current-capacity confirmation screen is currently limited to half-marathon users. Missing values are reported by exact field and sent to assessment as the existing fallback. That fallback cannot manufacture confirmation. A separately scoped 5K evidence-confirmation UI is required before affected real users can activate. No timestamp is silently filled in this milestone.

## Verification and Android checklist

Automated full run: **113 suites / 649 tests passed**. TypeScript, full ESLint and all four existing Python policy validators passed. Tests include native-adapter dispatch/failure, signed trust, forged objects, revoked approvals, key version history, network loss, clock changes, account changes, three persisted assignments, concurrent retry and rollback. After the full run, the backwards-clock guard passed a focused **6-suite / 36-test** rerun; the final missing-versus-unsupported experience classification passed **11 application tests**. Passing software tests is not coaching approval.

No Gradle task, APK installation, device verification or real-user publication was performed.

Run locally in Windows PowerShell:

```powershell
cd D:\Projects\AiSensei
.\scripts\build-torto-internal.ps1
adb -s 5d243b77 install -r D:\Projects\AiSensei\android\app\build\outputs\apk\release\app-release.apk
```

Do not uninstall or clear app data. Use the existing signing configuration; stop if Android reports a signature mismatch. A Metro reload alone cannot install the new native module.

Native provider test, separately on your local build environment (the instrumentation runner may install a test APK, not clear Torto data):

```powershell
cd D:\Projects\AiSensei\android
.\gradlew.bat :torto-release-crypto:connectedDebugAndroidTest
```

If local path length/environment setup requires the build script's drive mapping, use that same short Android path for instrumentation. Confirm the selected device with `adb devices`. This test checks Android JCA, not the JS bridge; also smoke-test `TortoReleaseCrypto.sha256('abc')` through a development debugger and compare with `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.

On the physical app:

1. Sign in and open Plan. With the shipped empty trust config, a compatible preview remains inactive; no activation action is available.
2. Confirm an incomplete runner field opens its focused question, while internal policy approval failure does not reopen onboarding.
3. Switch accounts during refresh; no previous-account result should appear. Check existing GPS and History records remain intact.
4. Go offline. Existing saved workouts/history must remain readable; fresh publication must fail closed rather than trusting cached non-revocation.
5. Authorized publication acceptance requires legitimate roots, reviewer approvals, endpoint and current runner confirmation. Test once, retry, restart, and verify exactly three identical saved Week 1 assignments. Until that setup exists, the successful path is verified only using isolated automated fixtures.

Remaining release blockers: native build/bridge/device acceptance; real operational trust service and enrollment; exact qualified coaching approvals including the compatibility successor; truthful 5K confirmation collection; final explicit publication UI and end-to-end Android acceptance. No Week 2 progression is authorized by this work.

## Changed implementation files

- `modules/torto-release-crypto/package.json`
- `modules/torto-release-crypto/expo-module.config.json`
- `modules/torto-release-crypto/android/build.gradle`
- `modules/torto-release-crypto/android/src/main/AndroidManifest.xml`
- `modules/torto-release-crypto/android/src/main/java/expo/modules/tortoreleasecrypto/TortoReleaseCryptoModule.kt`
- `modules/torto-release-crypto/android/src/androidTest/java/expo/modules/tortoreleasecrypto/ReleaseCryptoTest.kt`
- `src/config/policyAuthorization.ts`
- `src/services/security/releaseCrypto.ts`
- `src/services/security/releaseTrust.ts`
- `src/services/security/loadReleaseAuthorization.ts`
- `src/services/account/publicationAccount.ts`
- `src/domain/planning/verifyPolicyRelease.ts`
- `src/application/currentBeginner5kPublication.ts`
- `src/application/beginner5kPublication.ts`
- `src/application/publishAuthorizedPolicyWeek.ts`
- `src/data/repositories.ts`
- `src/application/consumerPlanStatus.ts`
- `src/domain/assessment/planAvailability.ts`
- `src/application/planAvailability.ts`
- `src/features/execution/planAvailabilityPresentation.ts`
- `src/features/execution/PlanAvailabilityCard.tsx`
- `tests/support/releaseApprovalFixtures.ts`
- `tests/services/releaseCryptoAndroid.test.ts`
- `tests/services/releaseTrust.test.ts`
- `tests/services/loadReleaseAuthorization.test.ts`
- `tests/services/publicationAccount.test.ts`
- `tests/application/currentBeginner5kPublication.test.ts`
- `tests/features/planAvailabilityPresentation.test.ts`
- `docs/android-policy-publication.md`
- `docs/beginner5k-publication-integration.md`

The workspace already contained many unrelated earlier edits; the list above is this integration's scope, not the entire working-tree diff.
