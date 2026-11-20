# GPS lifecycle acceptance review — 14 November 2026

Independent source and deterministic-test review of the current workspace. No production implementation was changed. This supersedes the acceptance claims in the lifecycle handoff, not the earlier audit's historical findings. Physical Android behavior remains unverified.

## Separate decisions

| Scope | Decision | Conditions |
| --- | --- | --- |
| A. Lifecycle implementation | **Corrections required** | Runtime rollback chaining and failure recovery are not fully fail-closed. |
| B. Internal Android testing | **Ready with restrictions** | Disposable test workouts, one account, one session at a time; no rapid replacement or account-switch stress testing with valuable data. This is diagnostic permission, not accuracy approval. |
| C. Terra dashboard | **Approved for presentation-only development** | Use fixtures and the existing shared contract; no new GPS subscriber, distance engine, activation or production integration. |
| D. External release | **Blocked** | Resolve findings below, test failure paths and process death on Android, establish native event provenance, and validate Metric V3 physically. V4 remains inactive. |

## Inspected implementation and verified fixes

Paths below are relative to D:/Projects/AiSensei.

- `src/application/backgroundGpsTask.ts`: `commitGpsResume` updates the paused session and binding generation within one exclusive transaction. A failed binding write rolls the session back. Permission denial happens before this commit in `resumeTracker`.
- `compensateGpsResumeFailure` checks owner/session/generation and the exact final open segment. Successful compensation deletes that segment's points/edges, rebuilds splits, restores the retained anchor, removes the segment, and leaves the consumed generation intact. The next resume increments it. This monotonicity is per session, not a global native event identity.
- `setGpsRecordingCutoff` installs a provisional cutoff before queued writes; a token prevents an older failed attempt from directly deleting a newer value. A single failure restores the previous value. See the concurrent-failure defect below.
- `reconcileEvidenceAtCutoff` retains observations at the boundary and removes those strictly after it; distance comes from the last retained cumulative edge and splits are rebuilt. A new injected failure after point deletion proves that the test transaction restores points, edges, splits, session, binding and GPS state together. A subsequent observation is accepted, proving single-attempt runtime rollback too.
- `src/application/workoutTracker.ts`: `recoverTracker` selects the exact owned active binding when present. The existing unrelated-newer-session and pending-resume recovery tests pass. Pause/Finish persist their cutoff before native stop; background timing is still assigned by observation time.
- `src/features/auth/AuthProvider.tsx`, `AuthBoundary.tsx`: failed prepared account exit preserves SQLite ownership, removes the visible user and presents an explicit blocked state. Helper and routing tests pass, but they do not mount/test the full provider's asynchronous transitions.
- `src/data/trackingMetricsRepository.ts`: binding updates/deletes use expected owner, session and generation. `src/data/expoSqliteDatabase.ts` uses an exclusive transaction connection. The JavaScript queue alone is not a cross-runtime lock.

## Remaining findings

### 1. Reproducible orphaned cutoff after two failed attempts

`setGpsRecordingCutoff` saves `previous` at invocation time, even if that value is an uncommitted attempt. Invoke A and B before A settles, and fail both writes. A sees B's token and leaves it alone; B then restores A's failed provisional value. SQLite has no cutoff, but subsequent valid observations are rejected by the runtime map.

Added ordinary passing diagnostic assertion: `documents that two concurrent failed cutoffs restore an orphaned runtime cutoff` in `tests/application/workoutTracker.test.ts`. This test documents the defect; it is **not** an assertion of desired behavior. The tracker busy guard narrows ordinary UI exposure, but the exported lifecycle helper does not satisfy its claimed concurrency contract.

Required correction: distinguish committed rollback state from provisional attempts; do not resurrect a failed predecessor. Test overlapping older-failure/newer-success and both-failure cases. The previous newer-cutoff test awaits the first failure before issuing the second request, so it is not a concurrency reproduction.

### 2. Compensation failure leaves durable Resume intent active

Source-confirmed error path in `resumeTracker`: native restart fails; native stop errors are discarded; compensation is awaited without an outer fail-closed transition. If compensation storage fails, its transaction correctly rolls back, but the already committed resume remains recording with its open segment and potentially accepted anchor. The in-memory snapshot is also recording. There is no durable retirement-failure acknowledgement or guaranteed retry before subsequent operations.

Atomic rollback is necessary but insufficient here: rollback restores the state before *compensation*, which is the failed resumed recording, not the prior paused workout. This compounded native/storage failure is not exercised by the current full lifecycle tests. Require explicit unresolved lifecycle recovery and failure-injection coverage. Do not claim that failed Resume can never leave evidence under every persistence failure.

### 3. Authentication recovery does not consistently preserve the blocked transition

Source-confirmed in `AuthProvider.restore`: after a failed explicit sign-out preparation, Supabase can still hold account A. Retry resolves blocked owner A, but runs preparation only when A differs from the authenticated user. It then clears `transitionOwnerRef` and can enter ready without retrying the failed cleanup. This is not evidence of impersonation—the authenticated user is still A—but it contradicts the promised blocked-workout recovery semantics.

Also, the null-session listener awaits `preparePersistedAccountExit` before its try/catch. That helper awaits `loadPersistedOwner` outside its own catch. An owner-read rejection therefore escapes the listener instead of reliably entering blocked recovery. Existing helper tests inject failure in preparation, not owner loading, and do not cover full provider interleavings. Require provider-level tests for both cases and concurrent restore/null-session events.

### 4. Legacy evidence and failure guarantees remain conditional

V1 compensation reconstructs total distance from retained points. The test covers a complete retained route. For legacy sessions whose stored distance predates complete route-point persistence, this cannot preserve the stored baseline reliably. Preserve the pre-resume stored distance as durable intent rather than assume a complete historical route. Cutoff reconciliation explicitly rejects V1 post-cutoff evidence instead of deleting it; it is fail-closed but not a supported successful Pause/Finish in that case.

Completed rows are protected by lifecycle state checks; reconciliation is not a historical recomputation job. No historical activity was altered during this review. Route deletion is session-scoped after owner validation; edge/split deletion includes owner as well. Cutoff captures the current generation inside its transaction rather than accepting an expected originating generation, so it is not a stale-caller provenance guard.

## Migration 24 and restart assessment

Migration 24 is additive: nullable cutoff token, epoch (default 1), nullable pipeline start, nullable trusted anchor timestamp/latitude/longitude/accuracy, and quarantine (`pending`, `ready`, `blocked`, default `ready`). Existing bindings remain compatible rather than unexpectedly quarantined.

The migration suite passed. A separate Python SQLite in-memory check executed the actual migration-23 table SQL, inserted a populated binding, applied all eight migration-24 ALTER statements, and verified all original columns unchanged and the default quarantine `ready`. This checks SQLite SQL behavior, not an Android installation upgrade or every production table.

Epoch records a JS lifecycle attempt; pipeline start excludes earlier observations; pending quarantine admits the exact trusted anchor; blocked quarantine rejects all evidence. None proves native origin. Cutoff tokens distinguish attempts but do not provide a cross-runtime rollback journal.

Crash before resume transaction commit leaves paused state. Crash after commit is recovered as interrupted, not silently resumed, by the existing restart test. A crash after native start but before UI confirmation cannot be distinguished as a successfully acknowledged native generation by these fields alone. Pause recovery also depends on checkpoint/cutoff ordering; test real process death at each durable/native boundary before acceptance. Mock rollback does not prove concurrent native SQLite scheduling.

## Native containment and minimum future adapter

The generationless callback limitation is acknowledged prior work, not a new discovery. Current safeguards support ordered single-session observations, pause timestamp exclusion, duplicate rejection, and resume anchoring under normal successful lifecycle operations. Delayed old-pipeline observations earlier than the new start are rejected. Once quarantine is ready, a plausible old callback inside the new segment can still be stored under a replacement account/session. The existing passing diagnostic demonstrates this representational ambiguity; it is not an Android trace proving its frequency.

For internal testing: keep one account and session, avoid rapid session/account replacement, stop after any lifecycle error, and recover explicitly. These procedural restrictions reduce exposure; they are not enforced provenance guarantees. Do not test cross-account races using important recordings.

Before external release, use one native Android collection adapter replacing the existing collection entry point, not a second tracker. At native pipeline creation bind an immutable token `(ownerId, sessionId, generation, pipelineEpoch)` to that callback/registration. Persist a native lifecycle journal for restart. Every observation and stop/start acknowledgement carries the originating token; never stamp an old callback with whichever binding is current at delivery. Compare tokens against the authoritative SQLite binding inside the evidence transaction before feeding the unchanged Metric V3 engine. Pause/Finish retire the token with the observation cutoff; Resume creates a new token only after durable intent. Recovery reconciles native journal and SQLite and fails closed on disagreement. Bounded buffering/acknowledgement and process-death tests must cover in-flight callbacks. No adapter was implemented.

## Verification results

- TypeScript: passed, including after diagnostic edits.
- Full ESLint: no errors; existing array-style warnings in `src/features/execution/workoutPresentation.ts` at lines 93 and 118.
- Focused lifecycle/migration/authentication: **3 suites, 54 tests passed**.
- Full Jest: **119 suites, 725 tests passed** (includes the two added diagnostic tests).
- Both runs used `--detectOpenHandles`, without `--forceExit`, and exited normally with code 0. No open handle was reported. The earlier forced-exit requirement is not reproduced; there is no evidence from this run identifying a location listener, database, timer or auth listener leak. Nor does mocked Jest prove production resource cleanup. Do not classify an unobserved historical hang as harmless or as a confirmed production defect.
- No `test.failing`/`it.failing` cases found. Known-defect diagnostics are ordinary passing assertions and are explicitly identified above.
- All four policy validators passed: main pack, foundation, reassessment, starting-workload comparison. These establish consistency, not coaching approval.
- V3 remains selected for new sessions; V4 remains outside production tracking. No algorithm, policy, persistence implementation, package ID or signing changes; no Gradle or device test.

Raw Jest summaries: `artifacts/lifecycle-review-focused.log`, `artifacts/lifecycle-review-jest.log`.

## Physical Android checklist

1. Upgrade without clearing data. Confirm existing History and paused/interrupted session ownership before starting a disposable run.
2. Use one account; start one workout. Record stationary behavior and a measured route separately. Capture device/OS, permissions, battery settings and observation timestamps.
3. Lock for one minute during movement, switch apps, return. Verify same session, active elapsed time, route, distance and freshness state; record any foreground/background discrepancy.
4. Pause, walk away, wait 60 seconds, resume. Confirm time and movement exclusion and a new anchor with no connecting jump. Repeat rapidly; expect only one resume action.
5. While paused revoke permission or disable location. Resume must fail visibly and remain paused; restore permission and retry. Stop testing on an unresolved lifecycle error.
6. Finish with updates arriving; compare saved History distance, active time, route and splits to the final snapshot. Reopen and check unchanged values.
7. In a separate disposable session terminate/reopen at controlled lifecycle boundaries; expect explicit interruption recovery, never silent resume. Force-stop continuity is not promised.
8. After the identified auth corrections, inject account-exit persistence failure and test expired/null sessions, same-account Retry and another-account login. Ownership must remain with the original account until recovery succeeds.
9. After a generation-tagged native adapter, stress delayed callbacks during session/account replacement and prove token rejection in logs. Do not infer this from UI appearance alone.

## Terra handoff and debugging model

Use `src/application/liveRunMetrics.ts` and `src/domain/tracking/liveRunMetrics.ts` for fixture-driven presentation. Preserve null pace/splits, recording state versus signal state, stable split IDs, and observation-time freshness. A display clock may provide evaluation time but must never add distance, start GPS or mutate evidence. Defer live-dashboard production integration pending correction acceptance and Android distance/lifecycle validation.

Debug in this order: binding identity/generation and quarantine; session segment timeline; durable cutoff versus runtime attempt; accepted observation timestamps; retained edge cumulative distance and rebuilt splits; UI snapshot. The key concept is that a database rollback only undoes its own transaction—it cannot undo an earlier committed native-start intent or an arbitrary JavaScript variable.

Understanding checks: Why can rolling back compensation leave a recording active? Why does a trusted anchor not prove the identity of the next native callback? Why must rollback state exclude earlier failed provisional cutoffs?
