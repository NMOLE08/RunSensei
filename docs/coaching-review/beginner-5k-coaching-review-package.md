# Beginner 5K coaching review package

**Purpose.** This is a review worksheet for a qualified running coach. It consolidates the two offline, draft-only Beginner 5K programmes currently encoded in RunSensei. It does not approve either programme, establish medical clearance, or enable live plan generation.

**Evidence method.** The figures below were extracted from the immutable policy JSON files and checked against the generators in `src/domain/planning/first5kPolicyPack.ts` and `src/domain/planning/continuous5kPolicyPack.ts`. Timed-session arithmetic is: `warm-up + main work + cool-down`. Each timed session has a 300-second walking warm-up and a 300-second walking cooldown. Week 12 session C is a 5,000 m walk/run completion event; its duration is deliberately unknown and is not converted to minutes.

## Reviewer record

| Field | Value |
| --- | --- |
| Reviewer name | |
| Credentials | |
| Review scope | |
| Review date | |
| Overall decision | ☐ Approve ☐ Modify ☐ Reject |
| Rationale | |
| Comments | |

If a rule is modified or rejected, record the affected policy ID/version, create a **new immutable policy version** rather than editing the current file, and run the associated regression tests before any release decision.

## Policy inventory and status

| Pathway | Exact policy references | Current status |
| --- | --- | --- |
| First-time beginner, run/walk | `runsensei.5k.first_5k_run_walk.periodization@0.1.0`; `weekly_load@0.1.0`; `extended_session@0.1.0`; `workout_selection@0.1.0`; `volume_distribution@0.1.0`; `training_pace@0.1.0`; `intensity@0.1.0`; `workout_structure@0.1.0`; `scheduling_safety@0.1.0` | Draft; `can_activate: false` |
| Continuous-running beginner | `runsensei.5k.continuous_beginner.periodization@0.1.0-draft`; `weekly_load@0.1.0-draft`; `extended_session@0.1.0-draft`; `workout_selection@0.1.0-draft`; `volume_distribution@0.1.0-draft`; `training_pace@0.1.0-draft`; `intensity@0.1.0-draft`; `workout_structure@0.1.0-draft`; `scheduling_safety@0.1.0-draft` | Draft; `can_activate: false` |

The short names in the table are suffixes of the full IDs above. The actual immutable source files are `PolicyPack/01_periodization_policy.json` through `09_scheduling_and_safety_policy.json` (including `02_weekly_training_load_policy.json`) and their `PolicyPack/continuous_5k_beginner/` equivalents.

## Evidence classification

The source files themselves state that the schedules are original RunSensei draft designs. NHS Couch to 5K supports a general beginner run/walk pattern, but does **not** validate this product's exact week-by-week table. No published reference in the repository validates an individual runner's injury risk or readiness.

| Classification | Meaning in this package |
| --- | --- |
| Directly sourced | The policy quotes or operationalizes a published general recommendation. It still needs applicability review. |
| Adapted | A source informed the direction, but the numerical value or product rule differs. |
| Original candidate | RunSensei-authored value, table, or transformation requiring coach review. |
| Unsupported | The current policies do not supply an executable rule. The software must return a gap/hold rather than invent one. |

Reference URLs recorded by the policy work:

- NHS, *Couch to 5K running plan*: <https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/>.
- Berkshire Healthcare, *Return to running programme*: <https://www.berkshirehealthcare.nhs.uk/advice/return-to-running-programme>.
- A systematic review cited in the policy work: <https://pubmed.ncbi.nlm.nih.gov/34478518/>.

## Programme 1 — First-time beginner run/walk

**Workout construction:** every A/B/C has 5 min walk warm-up, the specified repeated run/walk main block, then 5 min walk cooldown. Running targets are RPE 3–4; walking targets are RPE 1–3. These RPE ranges and every duration below are draft candidate values from `runsensei.5k.first_5k_run_walk.workout_structure@0.1.0`, not reviewed coaching advice. No pace or mileage target is included.

| Week | A main: run/walk × reps | B main: run/walk × reps | C main: run/walk × reps | Weekly timed total | Review note |
| --- | --- | --- | --- | ---: | --- |
| 1 | 1:00 / 2:00 × 6 (6:00 run, 12:00 walk) | same | 1:00 / 2:00 × 7 (7:00 run, 14:00 walk) | 87 min | |
| 2 | 1:30 / 2:00 × 6 (9:00 / 12:00) | same | 1:30 / 2:00 × 7 (10:30 / 14:00) | 96:30 min | |
| 3 | 2:00 / 2:00 × 6 (12:00 / 12:00) | same | 2:00 / 2:00 × 7 (14:00 / 14:00) | 106 min | |
| 4 | 2:00 / 2:00 × 5 (10:00 / 10:00) | same | 2:00 / 2:00 × 6 (12:00 / 12:00) | 94 min | Protected recovery week |
| 5 | 3:00 / 2:00 × 5 (15:00 / 10:00) | same | 3:00 / 2:00 × 6 (18:00 / 12:00) | 110 min | |
| 6 | 4:00 / 2:00 × 5 (20:00 / 10:00) | same | 4:00 / 2:00 × 6 (24:00 / 12:00) | 126 min | |
| 7 | 5:00 / 2:00 × 4 (20:00 / 8:00) | 5:00 / 2:00 × 5 (25:00 / 10:00) | 5:00 / 2:00 × 6 (30:00 / 12:00) | 135 min | |
| 8 | 4:00 / 2:00 × 4 (16:00 / 8:00) | same | 4:00 / 2:00 × 5 (20:00 / 10:00) | 108 min | Protected recovery week |
| 9 | 6:00 / 2:00 × 4 (24:00 / 8:00) | same | 6:00 / 2:00 × 5 (30:00 / 10:00) | 134 min | |
| 10 | 9:00 / 2:00 × 3 (27:00 / 6:00) | same | 9:00 / 2:00 × 4 (36:00 / 8:00) | 140 min | |
| 11 | 10:00 / 2:00 × 3 (30:00 / 6:00) | same | 10:00 / 2:00 × 4 (40:00 / 8:00) | 150 min | |
| 12 | 8:00 / 2:00 × 2 (16:00 / 4:00) | 6:00 / 2:00 × 2 (12:00 / 4:00) | 5,000 m self-paced walk/run; walking breaks allowed; duration unknown | A+B = 56 min; event unknown | Race/completion week |

**Arithmetic check.** Weeks 1–11 total the three main blocks plus 1,800 seconds (three 10-minute warm-up/cooldown pairs). For example, week 1 is 1,080 + 1,080 + 1,260 + 1,800 = 5,220 seconds = 87 minutes. Week 2 is 5,790 seconds = 96:30. These sums were checked directly from the policy table; they do not constitute a coaching approval.

## Programme 2 — Continuous-running beginner

**Workout construction:** every timed session is a 5 min walk warm-up, one continuous easy run, and a 5 min walk cooldown. The policy does not assign GPS pace or distance targets. All numeric values are original draft candidates in `runsensei.5k.continuous_beginner.workout_structure@0.1.0-draft`.

| Week | A continuous run | B continuous run | C continuous run/event | Weekly timed total | Review note |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 15 min | 15 min | 20 min | 80 min | |
| 2 | 16 min | 16 min | 22 min | 84 min | |
| 3 | 17 min | 17 min | 24 min | 88 min | |
| 4 | 15 min | 15 min | 20 min | 80 min | Protected recovery week |
| 5 | 18 min | 18 min | 26 min | 92 min | |
| 6 | 19 min | 19 min | 28 min | 96 min | |
| 7 | 20 min | 20 min | 30 min | 100 min | |
| 8 | 18 min | 18 min | 26 min | 92 min | Protected recovery week |
| 9 | 21 min | 21 min | 32 min | 104 min | |
| 10 | 22 min | 22 min | 34 min | 108 min | |
| 11 | 23 min | 23 min | 36 min | 112 min | |
| 12 | 15 min | 12 min | 5,000 m self-paced walk/run; duration unknown | A+B = 47 min; event unknown | Race/completion week |

For each Weeks 1–11 total: `(A main + B main + C main) + 30 minutes` for the three warm-up/cooldown pairs. This produces the shown 80, 84, 88, 80, 92, 96, 100, 92, 104, 108, and 112 minute totals.

## Entry and workload-compatibility criteria to review

The selector and research-only candidate compatibility evaluator are deliberately conservative. The table below reports draft policy values, not medical screening or established universal thresholds.

| Pathway | Draft requirements / candidate criteria | Classification | Review decision |
| --- | --- | --- | --- |
| First-time run/walk | adult confirmation; comfortable 30-minute walking evidence; first-5K classification; 3 non-consecutive available days; no health concern. Evidence freshness max 28 days. | `30 min`/`28 days`: original candidates; scheduling: original candidate | ☐ Approve ☐ Modify ☐ Reject |
| Continuous-running | same baseline gate plus evidence of 20 min continuous run, at least 50 min recent weekly running, longest recent session 20 min, max evidence age 28 days, 3 non-consecutive days, no health concern. | 20/50/20 and 28 days are original candidates; source-informed only | ☐ Approve ☐ Modify ☐ Reject |

The workload evaluator now treats a weekly aggregate and a single longest-session record as **incomparable** unless their units, aggregation, coverage and inclusion relationship match. A 28-day weekly average is not contradictory merely because it differs from an individual longest session.

## Review checklist

### 1. Entry and starting workload

- [ ] Is each pathway's intended runner category appropriate?
- [ ] Are the 30-minute walking, 20-minute continuous-running, 50-minute weekly-running, 20-minute longest-session, and 28-day freshness candidate values justified, revised, or rejected?
- [ ] Are the first week A/B/C workloads appropriate for the evidence required at selection?
- [ ] Does the wording avoid presenting the check as medical clearance?

### 2. Progression, recovery and rest

- [ ] Review every weekly table value, Weeks 4 and 8 recovery structure, and Session C progression.
- [ ] Confirm three non-consecutive training days and recovery across Sunday-to-Monday boundaries.
- [ ] Confirm no speedwork/pace prescription is being inferred.
- [ ] Confirm a missed session is not automatically made up adjacent to another session.

### 3. Final 5K and adaptation

- [ ] Confirm Week 12 A/B preparation and the self-paced 5,000 m completion event.
- [ ] Confirm event duration stays unknown until recorded; walking breaks remain allowed.
- [ ] Review repeat-stage consequences: a flexible-goal repeat yields a 13-week/39-session **draft preview**; fixed goal dates must conflict rather than compress the plan.
- [ ] Review that the Week 12 event is never duplicated or transformed into a timed workout.
- [ ] Review conditions for advance, repeat, maintain, reduce and hold in `adaptation-rule-review.md`.

### 4. Clinical/symptom wording (separate safety review)

- [ ] Confirm pain/new concerning symptoms trigger a conservative hold and appropriate clinical-evaluation guidance, not diagnosis or clearance.
- [ ] Confirm fatigue, interruption, and incomplete evidence are not silently treated as readiness.

## Reviewer acknowledgement

Passing automated tests verifies that the code follows the encoded draft tables and safety gates. It **does not** establish coaching safety, clinical safety, efficacy, or suitability for an individual runner. Current policy files remain draft and release-blocked until an authorized review process creates approved immutable replacements.
