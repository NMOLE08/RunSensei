# Beginner 5K numerical-policy review matrix

This matrix is a review record, not an approval record. Values are transcribed from the current immutable JSON policy packs and the corresponding generator code. All referenced policies are draft and release-blocked.

## Reviewer record

| Reviewer name | Credentials | Scope | Date | Overall decision | Rationale / comments |
| --- | --- | --- | --- | --- | --- |
| | | | | ☐ Approve ☐ Modify ☐ Reject | |

For each modified/rejected row: identify a new immutable policy ID/version, list the dependent algorithms, and add or update regression tests. Do not edit a historical policy version.

## Provenance classes and evidence limits

| Class | Meaning | Limits |
| --- | --- | --- |
| Directly sourced | General concept or statement traceable to a published source. | Does not establish that the RunSensei programme values are safe for an individual. |
| Adapted | Product rule derived from, but not identical to, source material. | Requires a coach to assess the adaptation. |
| Original candidate | RunSensei-created number, schedule, transformation, or decision rule. | Must be independently approved or rejected. |
| Unsupported | No executable rule exists in the present policy. | Software must hold or return `policy_gap`, not guess. |

Recorded source URLs: NHS Couch to 5K (<https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/>); Berkshire Healthcare return-to-running programme (<https://www.berkshirehealthcare.nhs.uk/advice/return-to-running-programme>); cited systematic review (<https://pubmed.ncbi.nlm.nih.gov/34478518/>). They support broad beginner-running concepts only; they do not validate either original 12-week RunSensei table.

## Core programme parameters

| Policy reference | Rule / exact value | Classification | Applicability and limitation | Decision |
| --- | --- | --- | --- | --- |
| `runsensei.5k.first_5k_run_walk.workout_structure@0.1.0` | 300 s walking warm-up and 300 s walking cooldown for every session | Original candidate | First-time run/walk pathway; source file calls schedule original draft | ☐ Approve ☐ Modify ☐ Reject |
| same | Run segments RPE 3–4; walking RPE 1–3 | Original candidate | No pace target; RPE interpretation and population suitability require review | ☐ Approve ☐ Modify ☐ Reject |
| same | 36 exact sessions: run/walk values in the coaching package table | Original candidate | Full table is the numerical source; no distance or pace conversion permitted | ☐ Approve ☐ Modify ☐ Reject |
| same | Week 12 C: 5,000 m self-selected comfortable walk/run; breaks allowed; duration unknown | Original candidate | Event must not be converted to time or duplicated | ☐ Approve ☐ Modify ☐ Reject |
| `runsensei.5k.continuous_beginner.workout_structure@0.1.0-draft` | 300 s walking warm-up and 300 s walking cooldown | Original candidate | Continuous pathway; no pace or distance target | ☐ Approve ☐ Modify ☐ Reject |
| same | 36 exact sessions: continuous-run values in the coaching package table | Original candidate | Full table must be reviewed as a whole, not inferred from NHS | ☐ Approve ☐ Modify ☐ Reject |
| same | Week 12 C: 5,000 m walk/run; breaks allowed; duration unknown | Original candidate | Same event protections as run/walk pathway | ☐ Approve ☐ Modify ☐ Reject |
| both periodization/weekly-load/extended-session packs | Protected recovery structure in Weeks 4 and 8 | Original candidate | Code validates that schedule changes do not increase protected recovery workload; no generic recovery percentage is used | ☐ Approve ☐ Modify ☐ Reject |
| both scheduling/safety packs | Three non-consecutive training days; default Tue/Thu/Sun | Original candidate | Scheduler rejects impossible availability; must be reviewed for intended population | ☐ Approve ☐ Modify ☐ Reject |
| both training-pace/intensity packs | No GPS pace target, speedwork, or invented distance-to-time estimate | Direct safety constraint | Preserves unknown metrics; needs no numerical conversion approval | ☐ Approve ☐ Modify ☐ Reject |

## Periodization, progression and intensity parameters

| Policy reference | Rule / exact value | Classification | Applicability and limitation | Decision |
| --- | --- | --- | --- | --- |
| `runsensei.5k.first_5k_run_walk.periodization@0.1.0` and continuous equivalent | 12 plan weeks: base Weeks 1–4; development Weeks 5–8; race preparation Weeks 9–11; taper Week 12 | Original candidate | Phase names/placement must be reviewed against every programme table | ☐ Approve ☐ Modify ☐ Reject |
| same | Recovery Weeks 4 and 8; event Week 12; default event day Sunday | Original candidate | Fixed goal date must be in Week 12 or scheduling fails | ☐ Approve ☐ Modify ☐ Reject |
| run/walk `weekly_load@0.1.0` | Main-movement increase above 20% of the last higher non-deload weekly budget is a flag | Original candidate engineering guard | JSON expressly says 20% is not a universal safety prescription | ☐ Approve ☐ Modify ☐ Reject |
| run/walk `extended_session@0.1.0` | Weeks 1–11 Session C must not exceed historical non-deload maximum by more than 360 s in a proposed week | Original candidate engineering guard | JSON expressly says it is not a medical threshold | ☐ Approve ☐ Modify ☐ Reject |
| run/walk `intensity@0.1.0` and continuous equivalent | Maximum demanding sessions/week: 0; maximum run sessions/week: 3; minimum full rest days between runs: 1 | Original candidate | No automatic strength/interval addition; confirm intended scope | ☐ Approve ☐ Modify ☐ Reject |
| run/walk `scheduling_safety@0.1.0` and continuous equivalent | Exactly 3 weekly sessions; non-consecutive including Sunday-to-Monday boundary; default Tue/Thu/Sun | Original candidate | Scheduler enumerates alternatives; availability/time limits still must fit exact full sessions | ☐ Approve ☐ Modify ☐ Reject |
| run/walk `workout_structure@0.1.0` | Time resolution: 1 second | Direct implementation parameter | Arithmetic precision, not a coaching dose | ☐ Approve ☐ Modify ☐ Reject |

## Complete session-level numerical coverage

The full values are recorded in `beginner-5k-coaching-review-package.md` and are generated from the two immutable `08_workout_structure_policy.json` files. This table links each week to the exact policy-owned parameters so no session number is reconstructed from a chat response.

| Pathway | Weeks covered | Numerical parameters covered | Source |
| --- | --- | --- | --- |
| First-time run/walk | 1–11, A/B/C | `run_seconds`, `walk_seconds`, `repetitions`, `actual_running_seconds`, `walking_recovery_seconds`, `main_movement_seconds`, + 300 s WU/CD | `runsensei.5k.first_5k_run_walk.workout_structure@0.1.0` |
| First-time run/walk | 12 A/B/C | A/B exact runs, walks and repetitions; C exactly 5,000 m with unknown duration | same |
| Continuous | 1–11, A/B/C | `main_running_seconds` + 300 s WU/CD | `runsensei.5k.continuous_beginner.workout_structure@0.1.0-draft` |
| Continuous | 12 A/B/C | A/B exact continuous seconds; C exactly 5,000 m with unknown duration | same |

## Workload-compatibility candidate parameters

| Policy reference | Rule / exact value | Classification | Evidence and limitation | Decision |
| --- | --- | --- | --- | --- |
| `runsensei.5k.beginner.workload-compatibility@0.4.0-draft` | Comfortable walking evidence: 30 min | Original candidate | Source-informed gateway; not medical clearance or an injury-safety guarantee | ☐ Approve ☐ Modify ☐ Reject |
| same | Evidence age: maximum 28 days | Original candidate | Freshness rule requires direct coach decision | ☐ Approve ☐ Modify ☐ Reject |
| same | Continuous pathway: 20 min continuous run | Original candidate | Intended to match its first-session workload; not proven by source material | ☐ Approve ☐ Modify ☐ Reject |
| same | Continuous pathway: at least 50 min recent weekly running | Original candidate | Aggregation definition/window must be present; not a universal threshold | ☐ Approve ☐ Modify ☐ Reject |
| same | Continuous pathway: longest recent session 20 min | Original candidate | Must remain comparable to the actual observation definition and window | ☐ Approve ☐ Modify ☐ Reject |
| same | Run/walk pathway has no numeric weekly-minutes, longest-session, or continuous-running minimum | Unsupported | The engine must not make up a hidden threshold | ☐ Approve ☐ Modify ☐ Reject |
| same | Weekly aggregate vs. single longest session comparison requires matching units, aggregation, coverage and inclusion; otherwise `incomparable_time_windows` | Direct implementation safety rule | Corrects an invalid contradiction inference; needs reviewer confirmation only if it changes desired policy semantics | ☐ Approve ☐ Modify ☐ Reject |

## Adaptation-decision candidate parameters

| Policy reference | Rule / exact value | Classification | Limitation / required decision | Decision |
| --- | --- | --- | --- | --- |
| `runsensei.5k.beginner.adaptation@0.1.0-draft` | Priority: health → critical integrity → fatigue/interruption → missing evidence → policy gap → repeated difficulty → partial/missed → isolated difficulty → completed week | Original candidate | Precedence is software-deterministic but requires coaching approval | ☐ Approve ☐ Modify ☐ Reject |
| same | Repeated difficult outcomes: 2 or more → `reduce_candidate` | Original candidate | No lower-workload numerical prescription is supplied; this cannot become automatic reduction | ☐ Approve ☐ Modify ☐ Reject |
| same | One difficult workout → `maintain_candidate` | Original candidate | Must not be read as a universal fatigue/RPE rule | ☐ Approve ☐ Modify ☐ Reject |
| same | Completed scheduled week → `advance_candidate` | Original candidate | Completion facts alone do not establish readiness without approved stage rules | ☐ Approve ☐ Modify ☐ Reject |
| same | Missed/partial → `repeat_candidate`; unreported → `insufficient_evidence` | Original candidate | Requires review of stage and goal-date consequences | ☐ Approve ☐ Modify ☐ Reject |
| same | Reported unusual fatigue/interruption → `hold_for_review`; pain/new concerning symptoms → health hold | Adapted safety posture | Not diagnosis, medical triage, or clearance | ☐ Approve ☐ Modify ☐ Reject |

## Adaptation-prescription limits

| Policy reference | Rule / exact value | Classification | Limitation / required decision | Decision |
| --- | --- | --- | --- | --- |
| `runsensei.5k.beginner.adaptation-prescription@0.2.0-draft` | Advance/maintain: unchanged-plan preview | Original candidate | No automatic action or persistence | ☐ Approve ☐ Modify ☐ Reject |
| same | Repeat: only exact existing authored Week 1–11 stage; flexible goal becomes 13 weeks / 39 sessions | Original candidate | Whole sequence must validate; copied sessions receive new draft assignment IDs and retain source IDs | ☐ Approve ☐ Modify ☐ Reject |
| same | Fixed goal date + repeat → `fixed_goal_date_repeat_conflict` | Original candidate | No compression, silent extension, or event duplication | ☐ Approve ☐ Modify ☐ Reject |
| same | Reduce → `policy_gap` | Unsupported lower variant | Requires a reviewed lower-workload alternative before it can prescribe a session | ☐ Approve ☐ Modify ☐ Reject |
| same | Week 12 5K event cannot be copied/modified; one event only | Original candidate safety boundary | Must preserve unknown event duration | ☐ Approve ☐ Modify ☐ Reject |

## Required reviewer follow-through

| If decision is… | Required follow-through |
| --- | --- |
| Approve | Specify scope, population, policy version(s), and whether approval applies to base generation, compatibility, adaptation decision, or adaptation prescription. |
| Modify | Document replacement values/rules, evidence/rationale, and create a new immutable draft/approved policy version with regression tests. |
| Reject | Record why, list dependent algorithms/tests, keep the policy blocked, and specify whether a replacement policy is required. |

Software tests only verify implementation consistency. They cannot approve numerical training prescriptions or establish coaching/clinical safety.
