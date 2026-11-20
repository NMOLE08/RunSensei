# Beginner 5K release-blocker checklist

This checklist separates approvals that can be made independently. A missing adaptation approval does **not** automatically prohibit a separately approved non-adaptive initial plan. However, the current code keeps every listed policy draft-only and production-blocked; no release gate has been changed by this document.

## Review record

| Reviewer name | Credentials | Review scope | Date | Decision | Rationale / comments |
| --- | --- | --- | --- | --- | --- |
| | | | | ☐ Approve ☐ Modify ☐ Reject | |

## Gate A — Initial 5K plan generation

| Requirement | Policy/code dependence | Test evidence | Status / required decision |
| --- | --- | --- | --- |
| First-time run/walk 12-week programme | `runsensei.5k.first_5k_run_walk.*@0.1.0`; `src/domain/planning/first5kPolicyPack.ts` | `tests/domain/first5kPolicyPack.test.ts` verifies 36 sessions/arithmetic/Week 12 event | **Blocked:** all numerical tables are original draft candidates; coach must approve/modify/reject. |
| Continuous-running 12-week programme | `runsensei.5k.continuous_beginner.*@0.1.0-draft`; `src/domain/planning/continuous5kPolicyPack.ts` | `tests/domain/continuous5kPolicyPack.test.ts` | **Blocked:** all numerical tables are original draft candidates; coach must approve/modify/reject. |
| Schedule/recovery/deload structure | Both `periodization`, `weekly_load`, `extended_session`, `scheduling_safety` policies; System C | `tests/domain/first5kPolicyPack.test.ts`; `tests/domain/continuous5kPolicyPack.test.ts` | **Blocked:** review Weeks 4/8, three non-consecutive days, week-boundary recovery and Session C progression. |
| Entry gate wording | Personalization policy versions `0.2.0-draft` and `0.3.0-draft`; assessment/selector | assessment and selector tests | **Blocked:** coach must define approved intended population; this is not medical clearance. |

**Decision:** ☐ Approve for non-adaptive initial-plan scope ☐ Modify ☐ Reject  
**New immutable version required if modified/rejected:**  
**Dependent algorithms/tests:**  

## Gate B — Workload compatibility approval

| Requirement | Policy/code dependence | Test evidence | Status / required decision |
| --- | --- | --- | --- |
| First-time entry evidence | `runsensei.5k.beginner.workload-compatibility@0.4.0-draft`; `beginner5kWorkloadCompatibility.ts` | compatibility/assessment tests | **Blocked:** 30-minute walk and 28-day freshness values are original candidates. |
| Continuous entry evidence | same | compatibility tests and research fixture scenarios | **Blocked:** 20-minute continuous run, 50-minute weekly volume, 20-minute longest session, 28-day freshness are original candidates. |
| Measurement comparability | `measurementComparability.ts`; System D time-window tests | `tests/domain/workoutPerformance.test.ts`; `tests/domain/beginner5kAdaptation.test.ts` | **Technically implemented; semantic review needed:** non-equivalent windows/definitions become incomparable, not contradictory. |
| Missing/contradictory evidence | selector/compatibility evaluator | negative tests | **Blocked:** approved fallback/reassessment action is not supplied. |

**Decision:** ☐ Approve ☐ Modify ☐ Reject  
**New immutable version required if modified/rejected:**  
**Dependent algorithms/tests:**  

## Gate C — Adaptive coaching decision approval

| Requirement | Policy/code dependence | Test evidence | Status / required decision |
| --- | --- | --- | --- |
| Decision precedence | `runsensei.5k.beginner.adaptation@0.1.0-draft`; `evaluateBeginner5kAdaptation.ts` | System E tests | **Blocked:** precedence is an original candidate. |
| Two difficult outcomes | same | isolated vs repeated difficulty tests | **Blocked:** numerical count `2` is an original candidate. |
| Partial/missed/unreported | same; System D | System D/E factual-state tests | **Blocked:** repeat/hold semantics require coaching approval. |
| Fatigue, interruption, pain | same | fatigue/pain precedence tests | **Blocked:** needs coaching and separate clinical-safety wording review. |

**Decision:** ☐ Approve ☐ Modify ☐ Reject  
**New immutable version required if modified/rejected:**  
**Dependent algorithms/tests:**  

## Gate D — Adaptation-prescription approval

| Requirement | Policy/code dependence | Test evidence | Status / required decision |
| --- | --- | --- | --- |
| Exact-stage repeat | `runsensei.5k.beginner.adaptation-prescription@0.2.0-draft`; `previewBeginner5kAdaptation.ts` | preview/integration tests | **Blocked:** 13-week / 39-session flexible-goal repeat is research-only. |
| Fixed-date conflict | same | fixed-goal conflict tests | **Blocked:** no policy allows compression or automatic goal change. |
| Reduced workload | same | `reduce_candidate` negative tests | **Blocked:** no reviewed lower-workload variants. |
| Event protection | same; System C | event-preservation tests | **Technically implemented; requires policy confirmation:** no duplicated/timed Week 12 event. |
| Full modified sequence validation | adaptation preview validator | 13-week, deload, spacing, time-limit tests | **Blocked:** review must specify whether/rewhen modified progression is acceptable. |

**Decision:** ☐ Approve ☐ Modify ☐ Reject  
**New immutable version required if modified/rejected:**  
**Dependent algorithms/tests:**  

## Gate E — Clinical-safety wording review

| Requirement | Code/policy dependence | Status / required decision |
| --- | --- | --- |
| Pain/new symptom response | System A health hold, System E `hold_for_review` | **Blocked:** approve wording that encourages appropriate clinical evaluation without diagnosis or clearance. |
| Eligibility language | onboarding/assessment explanations | **Blocked:** confirm wording does not imply medical fitness, safety guarantee, or injury prevention. |
| Fatigue and interruption language | System D/E explanations | **Blocked:** confirm appropriate non-clinical messaging and escalation boundary. |

**Decision:** ☐ Approve ☐ Modify ☐ Reject  
**Reviewer credentials relevant to clinical/safety wording:**  
**New immutable version/copy change required if modified:**  

## Gate F — Production integration and persistence approval

| Requirement | Current implementation | Status / required decision |
| --- | --- | --- |
| Release status | Every program, compatibility, adaptation, and prescription policy is `draft` / `can_activate: false`. | **Blocked by design.** |
| User-facing compatibility gate | Strict gate does not promote research candidate selection to production. | **Must remain enforced** until independent approvals are versioned. |
| SQLite persistence | A–E review workflow is offline/research-only; it does not write production plans. | **Not authorized for this package.** |
| Plan mutation/adaptation | Preview produces draft differences only, never changes assignments. | **Not authorized for this package.** |
| Qwen/Strava | Not connected to this workflow. | **Out of scope / separately assess.** |
| Operational verification | Production onboarding, account isolation, migrations, notifications, and app UX need a separately authorized production integration plan. | **Outstanding.** |

**Decision:** ☐ Approve integration scope ☐ Modify ☐ Reject  
**Security/privacy reviewer and date:**  
**Migration/persistence tests required:**  

## Traceability to algorithms and missing tests

| Unresolved decision | Dependent algorithms | Existing automated coverage | Additional coverage before release |
| --- | --- | --- | --- |
| Exact 12-week workout values and recovery weeks | Systems B/C | session arithmetic, 36-session coverage, deload/event/scheduling validator tests | Approved-version regression fixtures and reviewer-signoff provenance tests |
| Workload-entry values (30 / 20 / 50 / 20 / 28) | System A → pathway selection | candidate compatibility and comparison tests | tests for every approved replacement boundary and input source/window |
| Completion/fatigue/difficulty decisions | System D → System E | completion correction, unreported/missed, precedence, repeated difficulty tests | approved evidence windows and review/re-entry tests |
| Repeat transformation and goal dates | System E preview → Systems B/C validation | 13-week/39-session, fixed/flexible, event preservation, history tests | every authorized modification type and end-to-end UI/persistence rejection tests |
| Clinical wording | System A/E user explanations | health-hold behavior tests | copy review, accessibility and clinician/safety approval tests |
| Production persistence | application/data layers | no production write path for this research package | transactional plan revisions, migration, account isolation and restart tests after explicit authorization |

## Required evidence before a release decision

- [ ] A qualified running coach has reviewed every numerical row in `numerical-policy-review-matrix.md` and each 36-session programme table.
- [ ] Any approved content exists as a new immutable version with policy ID/version references, reviewer scope, date and rationale.
- [ ] A clinical/safety reviewer has approved the health/eligibility wording independently where needed.
- [ ] Regression tests cover every changed/approved policy rule.
- [ ] Product, privacy, and engineering owners authorize a separate production integration/persistence scope.
- [ ] The application continues to block all draft policy activation until the above gates are fulfilled.

Passing the existing software tests means the draft code is internally exercised; it does not establish coaching safety, clinical validity, or readiness for public release.
