# Beginner 5K: verified release and atomic Week 1 publication

This report records the preceding 108-suite publication milestone. For the subsequent Android native verifier, root-signed enrollment, authenticated caller integration, current results and remaining blockers, see [Android authorization and publication](android-policy-publication.md). Android/device verification is still pending; the older integration TODOs below are historical.

## Status and boundaries

The application-side verification and persistence boundary is implemented. No real approval keys, signed approvals, or current revocation snapshot have been supplied. All actual training policies remain blocked. Neither onboarding nor the Plan UI was changed. Week 2 progression is not implemented.

The historical strict selector still returns `starting_workload_compatibility_rule_missing`. It is not bypassed or relabelled. The new, separately approved successor contract is `torto.5k.beginner.publication_compatibility@0.1.0-draft`, in `PolicyPack/16_beginner_5k_publication_compatibility_v0.1.0_draft.json`. It does not change historical numerical rules or declare them reviewed.

## Trust model

`verifyPolicyRelease.ts` uses standard Web Crypto RSA-PSS with SHA-256 and 32-byte salt. Each envelope has a pinned `keyId`, an exact UTF-8 JSON payload string, and a hex signature. No envelope may supply its own trusted key, reviewer allowlist, or policy content. The app imports those from `policyReleaseTrust.ts` and `beginner5kPublicationArtifacts.ts`.

The signed payload schema is `torto-policy-release-v1`, containing:

- `reference`: exact ID@version;
- `sha256`: digest of the full bundled artifact described below;
- `artifactId`, `reviewer`, and `scope`;
- `approvedAt`, `notBefore`, `expiresAt`: ISO instants;
- `applicationId: com.aisensei.app`, `channel: production`.

Both compatibility policies require `workload_compatibility` scope. Other required artifacts require `initial_week_publication` scope. Keys must be explicitly authorized for the reviewer, scope, and exact references. Missing or duplicate dependency approvals fail closed. Revoked keys/artifacts, expired trust snapshots, future/expired approvals, bad signatures and digests fail closed. There is no caller-controlled “approved” boolean.

Successful verification creates an immutable process-local capability registered in a private WeakMap. Copying or deserializing its fields does not authorize anything. The publication adapter verifies signatures afresh on every request, including retries. The capability is never persisted as reusable authority. Audit data records the approved content identity and artifact IDs; assignment provenance includes all mandatory references.

### Policy integrity format

For digest format v1, SHA-256 covers UTF-8 `JSON.stringify` of the complete bundled JSON object, including its review metadata. File whitespace is not included; property order and all values are included. This is explicitly a serialized-content digest, not the raw file-byte checksum. Signers must use exactly the same serialized artifact; a pretty-printed file checksum will not match. Derived pack and pathway objects have separate digests as well as their complete source-policy dependencies.

`beginner5kPublicationArtifacts.ts` uses explicit static imports. The mandatory reference list is derived from exact personalization, compatibility, calendar, pack, pathway, validator and session references, not supplied by an approval envelope. No historical file was edited. Synthetic reviewer keys and signatures exist only in tests.

### External release setup still required

1. Independently establish qualified reviewers' identities, credentials and permitted scopes; approve the exact numerical and calendar decisions. Software cannot establish coaching competence from a signature.
2. Keep private signing keys outside the app/repository; securely enroll corresponding public SPKI keys in the reviewed release configuration, with exact reviewer/scope/reference permissions.
3. Sign every required artifact and the new compatibility contract using the documented payload format. Do not alter immutable drafts merely to fill approval fields; release evidence is separate.
4. Supply a reviewed, expiring revocation snapshot. The present offline model can only know revocations in its pinned snapshot. It does not claim instantaneous revocation while offline. Refresh/distribution and rollback protection require release engineering before deployment.
5. Provide and verify Web Crypto availability on the target Android runtime. No native crypto dependency was added. If `crypto.subtle` is unavailable, the verifier returns `cryptographic_verifier_unavailable`; it never falls back to trusting labels. Node Web Crypto tests do not prove Hermes support.
6. Validate clock assumptions. Approval expiry uses the application evaluation instant; an offline device clock is not a cryptographically trusted time source.

Standards: [Node Web Crypto](https://nodejs.org/api/webcrypto.html); [Expo SQLite transaction documentation](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/).

## Compatibility successor

`evaluateBeginner5kProductionCompatibility` is a distinct successor adapter. It requires the verified complete dependency graph before interpreting the existing v0.4 rules as eligible for publication. Existing research results remain `productionEligible: false`.

It preserves adult/walking confirmations, exact experience matching, completion goal, health holds, interruption review, original numerical capacity thresholds, original freshness limits and calendar v0.5 semantics. No session-time questions were added. It requires valid, non-future weekly/current-capability confirmation dates and a longest-session observation date. Ages use the runner's timezone and local calendar dates, not onboarding technical timestamps. It invokes the existing candidate evaluator with these explicit ages; missing ages no longer silently satisfy this new publication contract.

Unknown or incompatible observation windows remain incomparable. The onboarding source does not provide equivalent weekly-total/session-membership metadata, so 50 average weekly minutes and a 75-minute individual session are not automatically contradictory. Existing candidate evaluation retains its comparable-window consistency checks. This adapter does not invent aggregate membership or activity history.

The qualified review scope must explicitly cover:

- v0.4 run/walk entry and continuous-running numerical rules;
- use of current confirmations as freshness evidence;
- incomparability of measurements from different windows;
- v0.5 calendar-only availability, with personal time availability unassessed;
- the complete exact workout pack and its nine dependencies;
- release of only the initial week, without automatic future-week authorization.

## Exact missing approvals

For run/walk, the required graph includes:

- `runsensei.5k.beginner.personalization@0.3.0-draft`
- `runsensei.5k.beginner.workload-compatibility@0.4.0-draft`
- `torto.5k.beginner.calendar_availability@0.5.0-draft`
- `torto.5k.beginner.publication_compatibility@0.1.0-draft`
- the exact selected pathway reference returned by `requiredBeginner5kPublicationReferences`
- `runsensei.5k.first_5k_true_beginner_run_walk.pack@0.1.0-draft`
- all nine `runsensei.5k.first_5k_run_walk.*@0.1.0` policies: periodization, weekly_load, extended_session, workout_selection, volume_distribution, training_pace, intensity, workout_structure, scheduling_safety.

The continuous pathway requires its own exact pathway, pack and nine continuous-program policies instead. Approval for one pathway never authorizes the other. The resolver enumerates the concrete full graph for each attempt. No authentic approvals exist in the bundled trust configuration.

## Publication and idempotency

1. Capture a request snapshot before asynchronous verification. Check repository/draft account ownership and goal/profile relationships.
2. Recreate the existing 36-session preview and verify the exact signed dependency graph.
3. Evaluate the successor compatibility contract; independently validate/convert all 12 weeks. Preserve original dates, duration targets and alternating run/walk repetitions.
4. Generate only Week 1 with the existing generic scheduler. Include all exact source references in saved prescriptions.
5. Identity includes account, program/pathway version, start anchor, week and verified content digest. Approval artifact renewals alone do not change the content identity. Runner evidence changes are checked against the persisted fingerprint; they produce `publication_revision_conflict`, not an overwrite. Revised approval provenance also requires deliberate reconciliation rather than silent replacement.
6. `TrainingRepository.publishInitialPlanOnce` serializes same-connection callers and uses an exclusive SQLite transaction. Its first write claims the existing plan primary key using `INSERT ... ON CONFLICT(id) DO NOTHING`. The durable key protects separate connections as well. An existing claim must match the expected initial revision, evidence fingerprint, provenance and assignments.
7. New profile/goal/availability snapshots have publication-specific IDs and use plain inserts. Existing onboarding or historical records are never replaced. Source IDs are retained in the audit event. Plan, revision, sessions, assignments, input snapshots and audit either commit together or roll back together.
8. Return the reloaded snapshot. Retries return `applied: false` with original stored timestamps and assignments. Later revisions cannot be overwritten by a Week 1 retry.

No migration was needed: existing primary keys and `(revision_id, logical_session_id)` uniqueness already provide durable constraints. The Expo adapter uses the exclusive callback's own connection, so unrelated GPS writes do not enter the publication transaction. A 5-second SQLite busy timeout is an engineering wait limit, not a training parameter; persistent lock/storage failures return a persistence error and can be retried, never partial success.

## Verified versus still unverified

Automated coverage includes signed synthetic approvals, tampering, altered content, wrong versions/reviewers/scopes, missing dependencies, revocation/expiry, unavailable crypto, runner safety/eligibility failures, concurrent publication, stale retries, real SQLite primary keys and rollback, account isolation, original run/walk arithmetic and no future-week publication. Expo connection-isolation behavior is tested with a native adapter mock.

Physical Android/independent-process SQLite contention, clock tampering, platform cryptography, real signer enrollment, real approvals, production authentication-to-publication UI wiring, and Plan-to-GPS execution acceptance remain unverified or unfinished. No APK/Gradle/device test was performed. A synthetic signature proves cryptographic and software behavior, not coaching safety.

The internal Week 1 boundary is testable now, but authentic approvals alone are not sufficient to declare the app launch-ready: native crypto/trust distribution and the authenticated caller still require integration. Future-week reassessment remains an explicit hold and is outside this milestone.

## Verification results for this milestone

- TypeScript: passed.
- Full ESLint: passed.
- Focused authorization/publication/real-SQLite suites: 44 tests passed before the additional exclusive-connection regression test; that test is included in the final full run.
- Final full Jest: 108 suites, 619 tests passed.
- `PolicyPack/validate_policy_pack.py`: passed (nine original policies, 36 sessions, arithmetic, recovery, final event, release restrictions).
- Foundation, reassessment and starting-workload comparison Python validators: all passed.
- No Gradle build, physical Android verification, real reviewer approval or production publication was performed.
