# Beginner 5K adaptation-rule review

**Scope:** review of the offline, deterministic candidate-decision and draft-preview mechanics for the two Beginner 5K pathways. This document does not enable automatic adaptation, persistence, Qwen, Strava, or production plan changes.

## Reviewer record

| Field | Value |
| --- | --- |
| Reviewer name | |
| Credentials | |
| Scope reviewed | |
| Review date | |
| Decision | ☐ Approve ☐ Modify ☐ Reject |
| Rationale | |
| Comments | |

Every modification or rejection requires: (1) a new immutable policy version; (2) a list of dependent algorithms; and (3) regression tests showing the intended and prohibited outcomes.

## Exact policy references and current release state

| Policy | Purpose | Status |
| --- | --- | --- |
| `runsensei.5k.beginner.adaptation@0.1.0-draft` | Converts factual System D performance analysis into a decision candidate. | Draft; production eligible: false |
| `runsensei.5k.beginner.adaptation-prescription@0.2.0-draft` | Defines limited, offline preview transformations. | Draft; production eligible: false |
| First-time and continuous pathway pack versions recorded with every fact | Preserves the exact historical workout/policy snapshot used for analysis. | Draft; release blocked |

## Factual inputs, not coaching conclusions

System D (`src/domain/performance`) supplies immutable, version-aware factual outputs:

- planned versus actual duration, running duration, and comparable reliable distance;
- structured status: `completed`, `partial`, `missed`, `unreported`, or `different_activity`;
- feedback, unusual fatigue, discomfort, and data-quality flags;
- current outcome-version selection using `previousVersionId`, so corrections retain history without double-counting;
- policy, pathway, assignment, plan-revision, completion-evidence, and analysis identifiers.

Missing activity is **unreported**, not automatically missed. A past session becomes missed only when the outcome says so. A changed future plan cannot replace the historical prescription snapshot used for a completed workout.

## Candidate decision precedence

The implementation in `src/domain/adaptation/evaluateBeginner5kAdaptation.ts` resolves simultaneous conditions in this order. This is an original, draft candidate policy design; it is not a clinical or coaching standard.

| Priority | Condition | Candidate output | Evidence limitation | Reviewer decision |
| ---: | --- | --- | --- | --- |
| 1 | Pain/injury/new concerning symptom or existing health hold | `hold_for_review` | No diagnosis or clearance is made | ☐ Approve ☐ Modify ☐ Reject |
| 2 | Critical data-integrity problem | `hold_for_review` | Criticality definition needs review | ☐ Approve ☐ Modify ☐ Reject |
| 3 | Unusual fatigue or interruption | `hold_for_review` | Does not infer a medical cause | ☐ Approve ☐ Modify ☐ Reject |
| 4 | Required evidence missing/unreported | `insufficient_evidence` | Missing data is never success | ☐ Approve ☐ Modify ☐ Reject |
| 5 | Policy/version/reference gap | `policy_gap` | No fallback prescription is invented | ☐ Approve ☐ Modify ☐ Reject |
| 6 | Two or more difficult outcomes in the evaluated evidence | `reduce_candidate` | `2` is an original candidate; no lower-workload prescription exists | ☐ Approve ☐ Modify ☐ Reject |
| 7 | Partial or explicitly missed workout | `repeat_candidate` | Does not authorize a make-up session | ☐ Approve ☐ Modify ☐ Reject |
| 8 | One isolated difficult workout | `maintain_candidate` | One observation does not infer declining fitness | ☐ Approve ☐ Modify ☐ Reject |
| 9 | Complete scheduled week | `advance_candidate` | Does not establish readiness without approved stage rules | ☐ Approve ☐ Modify ☐ Reject |

This priority ensures pain, fatigue, integrity, and missing evidence prevent an apparent completion signal from escalating training. The policy intentionally does not use an unreviewed RPE threshold, a completion-percentage threshold, pace, GPS quality as a performance proxy, or an arbitrary weekly-volume formula.

## Decision-to-preview boundary

Only `src/domain/adaptation/previewBeginner5kAdaptation.ts` may create a research-only preview. It cannot write a plan.

| Candidate decision | Current draft transformation | Safety boundary / required review |
| --- | --- | --- |
| `advance_candidate` | Unchanged-plan preview only | A decision does not independently authorize moving to an unauthored stage. |
| `maintain_candidate` | Unchanged-plan preview only | No hidden workload adjustment. |
| `repeat_candidate` | Reuse only an exact authored Week 1–11 stage in research mode; generate new draft assignment IDs and preserve source assignment/workout/policy references. | Whole resulting sequence must validate. No completed record is copied or overwritten. |
| `reduce_candidate` | `policy_gap` | No approved lower-workload alternative exists. |
| `hold_for_review` | No actionable preview | Health and review cases cannot request workout changes. |
| `insufficient_evidence` | No actionable preview | User must supply/reconcile evidence first. |
| `policy_gap` | No actionable preview | Requires a new reviewed policy. |

## Repeat-stage consequences

| Scenario | Current behavior | Review question |
| --- | --- | --- |
| Flexible goal date | A valid exact-stage repeat produces a research-only 13-week, 39-session schedule. Later future stages shift. The proposed event-date change is displayed, never applied. | Is this transformation suitable for either pathway and under what evidence? |
| Fixed goal date | Repeat returns `fixed_goal_date_repeat_conflict`; it does not compress later work or silently move the event. | Are there any authorized alternatives? |
| Deload/recovery weeks | Adaptation preview validates the full modified sequence, recovery spacing, deload placement and accumulated structure. Warnings remain when no reviewed progression rule supports the modified sequence. | Which repeat placements are permitted? |
| Week 12 event | The 5,000 m event is never duplicated, copied as a stage, timed, or given a pace. | Confirm this event protection. |
| Unavailable day/time conflict | Preview returns a scheduling conflict, not a substitute session. | Confirm appropriate runner-facing options. |

## Evidence and safety review worksheet

| Rule | Policy reference | Classification | Evidence / limitation | Decision | Reviewer comments |
| --- | --- | --- | --- | --- | --- |
| Pain/new symptom → health hold | `adaptation@0.1.0-draft` | Adapted conservative safety wording | Requires separate clinical-safety wording review; no diagnosis | ☐ Approve ☐ Modify ☐ Reject | |
| Fatigue/interruption → hold | same | Original candidate | Needs explicit handling duration and re-entry policy | ☐ Approve ☐ Modify ☐ Reject | |
| Two difficult outcomes → reduce candidate | same | Original candidate | No numerical reduction is authorized | ☐ Approve ☐ Modify ☐ Reject | |
| Partial/missed → repeat candidate | same | Original candidate | Must not become catch-up workload | ☐ Approve ☐ Modify ☐ Reject | |
| Complete week → advance candidate | same | Original candidate | Completion alone may be insufficient | ☐ Approve ☐ Modify ☐ Reject | |
| Exact authored stage reuse only | `adaptation-prescription@0.2.0-draft` | Original candidate | No scaled work, no invented variant | ☐ Approve ☐ Modify ☐ Reject | |
| No lower-workload variant → policy gap | same | Unsupported boundary | Requires an independently reviewed alternative library | ☐ Approve ☐ Modify ☐ Reject | |
| Fixed-date repeat conflict | same | Original candidate | Needs a policy for goal changes, if any | ☐ Approve ☐ Modify ☐ Reject | |

## Clinical-safety wording review (separate from coaching approval)

The present behavior is intentionally conservative: pain/injury or new concerning symptoms block escalation and direct the person to appropriate clinical evaluation. It must not say that the app diagnoses conditions, clears someone to run, or substitutes for a clinician. A clinician/safety reviewer should approve the exact wording separately from workout-structure approval.

## Required validation evidence after a policy change

- Health concern and completed-week signals together still produce `hold_for_review`.
- One difficult workout and two difficult workouts remain distinguishable.
- Unreported remains distinct from missed.
- Corrected records are counted once, and original snapshots remain immutable.
- A repeat preserves the one Week 12 5K event, historical IDs/references, spacing, and no completed-session mutation.
- Fixed and flexible goal-date behavior remains explicit.
- No draft decision/preview can enter a production plan-creation interface.

Passing automated tests demonstrates deterministic code behavior only. It does not validate coaching safety or grant approval to these draft rules.
