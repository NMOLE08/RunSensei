# RunSensei — Beginner First 5K policy pack (DRAFT v0.1.0)

## What is inside
Eight individual JSON policy files for System B algorithms #6, #7, #8, #9, #10, #11, #12, #14, **plus** a ninth supporting scheduling/safety file (#13 and #19). The supplementary file is essential for the stated multi-week scheduling and safety goal. All policies include the requested 12 policy metadata fields and are intentionally `review_status: draft` and `release_gate.can_activate: false`.

- `01_periodization_policy.json`: 12-week phases, Weeks 4/8 recovery, Week 12 taper/event.
- `02_weekly_training_load_policy.json`: week-by-week **seconds** of run/walk main movement; records running time separately.
- `03_extended_session_policy.json`: novice extended easy run/walk progression, not distance-based long-run mileage.
- `04_workout_selection_policy.json`: only easy run/walk and event; no quality sessions.
- `05_volume_distribution_policy.json`: exact time distribution across three weekly sessions; no guessed mileage.
- `06_training_pace_policy.json`: RPE/talk test, no invented pace targets.
- `07_intensity_policy.json`: zero demanding workouts, nonconsecutive days.
- `08_workout_structure_policy.json`: exact **36 sessions** (A/B/C) with repeat counts and timers; Week 12 C is 5,000 m completion event.
- `09_scheduling_and_safety_policy.json`: constraints and deterministic schedule search; release and integrity checks.
- `validate_policy_pack.py`: runnable integrity checks with standard Python 3.
- `TERRA_INTEGRATION_PROMPT.md`: instructions to map policies into your actual TypeScript interfaces without silently enabling drafts.

## Essential source interpretation
The three **user-provided NYRR PDFs** are conservative/moderate/advanced 5K plans. They are not appropriate templates for true first-time runners without review: even the conservative file has speedwork and tempo work in Week 1. Preserve those three documents in the existing codebase for later, separate ability-level policies. **Do not label NYRR Conservative as couch-to-5K.**

A beginner reference is the NHS Couch to 5K approach: three running days weekly with a rest day between, timed run/walk progression, and five-minute walking warm-up/cool-down. NHS uses **9 weeks**, while this RunSensei **12-week progression is original and unvalidated**. These exact session counts, timing patterns, recovery weeks, and draft safety thresholds are engineering hypotheses, not published NHS or NYRR prescriptions. Obtain coach sign-off and appropriate health/safety review before use with real runners. The draft gate blocks production activation.

## Explicit units and fidelity
- Weeks 1–11: main budget equals run + walking-recovery seconds; each workout adds **300 seconds warm-up + 300 seconds cool-down**. Actual running seconds are shown separately.
- Week 12: two timed workouts followed by **a distance-goal 5,000 m event**. Total event minutes are **unknown** before completion. It must not be fabricated or forced into a minutes sum.
- Do not infer pace or mileage from minute budgets: pace targets are **null** for this beginner policy.
- A plan is for **completing** the 5K distance with walk breaks, not necessarily running it continuously or achieving a finish time.
- Any unapproved policy means **no live plan generation**; a local offline test harness can run draft simulations explicitly marked as unapproved.

## Source references
- NHS beginner running: https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
- NHS running injuries: https://www.nhs.uk/live-well/exercise/knee-pain-and-other-running-injuries/
- Supplied PDFs: `5k Training Plan Conservative.pdf`, `5k Training Plan Moderate.pdf`, `5k Training Plan Advanced.pdf`.

## Validate
From this folder run:

```bash
python validate_policy_pack.py
```

This checks internal consistency, not clinical safety. Terra must adapt additional TypeScript tests to the actual repository's API and schema.

## Integration
See `TERRA_INTEGRATION_PROMPT.md`. The repo's actual policy catalog/types have not been supplied, so these portable JSON schemas may need translation. Do not pretend they can be dropped into `systemB.ts` unchanged.
