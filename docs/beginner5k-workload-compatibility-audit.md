# Beginner 5K workload compatibility audit

Status: **draft-only coaching review package**. Neither programme is authorised for production activation.

## What this audit does

The existing two 12-week simulators can produce exact draft schedules, but their numerical tables do not contain a reviewed rule that maps a person's demonstrated capacity to a safe starting workload. The compatibility gate therefore records the factual comparison and returns `policy_gap`; it never calls a schedule suitable merely because a user selected it.

The gate also rejects a factual scheduling conflict when a selected weekday's stated minute limit is shorter than the fixed session on that weekday.

## Programmes compared

| Programme | Week 1 main work (A / B / C) | Week 1 total main work | Week 1 C | Protected recovery weeks | Final week |
| --- | --- | --- | --- | --- | --- |
| First-time run/walk | 18 / 18 / 21 min | 57 min | 21 min | 4 and 8 | Timed A/B; 5,000 m walk/run completion event with unknown duration |
| Continuous-running candidate | 15 / 15 / 20 min | 50 min | 20 min | 4 and 8 | Timed A/B; 5,000 m completion event with unknown duration |

Every timed session includes a five-minute walk warm-up and five-minute walk cooldown. The table above excludes those ten minutes per session. No conversion to distance, pace target, or speedwork is made.

## Full 12-week comparison

Numbers are main-work minutes only. `Event` deliberately has no estimated duration.

| Week | First-time run/walk A/B/C | Total | Continuous-running A/B/C | Total | Note |
| --- | --- | ---: | --- | ---: | --- |
| 1 | 18 / 18 / 21 | 57 | 15 / 15 / 20 | 50 | Candidate start |
| 2 | 21 / 21 / 24.5 | 66.5 | 16 / 16 / 22 | 54 | Candidate progression |
| 3 | 24 / 24 / 28 | 76 | 17 / 17 / 24 | 58 | Candidate progression |
| 4 | 20 / 20 / 24 | 64 | 15 / 15 / 20 | 50 | Protected recovery week |
| 5 | 25 / 25 / 30 | 80 | 18 / 18 / 26 | 62 | Candidate progression |
| 6 | 30 / 30 / 36 | 96 | 19 / 19 / 28 | 66 | Candidate progression |
| 7 | 28 / 35 / 42 | 105 | 20 / 20 / 30 | 70 | Candidate progression |
| 8 | 24 / 24 / 30 | 78 | 18 / 18 / 26 | 62 | Protected recovery week |
| 9 | 32 / 32 / 40 | 104 | 21 / 21 / 32 | 74 | Candidate progression |
| 10 | 33 / 33 / 44 | 110 | 22 / 22 / 34 | 78 | Candidate progression |
| 11 | 36 / 36 / 48 | 120 | 23 / 23 / 36 | 82 | Candidate progression |
| 12 | 20 / 16 / Event | 36 + event | 15 / 12 / Event | 27 + event | Event duration intentionally unknown |

The original run/walk numbers come from the existing immutable draft policy pack. The continuous-running values are original candidate draft content. Neither source establishes that the schedule is appropriate for any individual runner.

## Current evidence and decision outcomes

| Runner evidence / constraint | Current outcome | Why |
| --- | --- | --- |
| Health concern or health-related interruption | `health_hold` | Existing conservative safety pathway applies. It is not medical clearance. |
| Fewer than three non-consecutive available days | `scheduling_incompatible` | The draft programmes require three non-consecutive sessions. |
| Weekday minute limit below fixed scheduled session | `scheduling_incompatible` | A direct calendar/time-budget conflict is provable. |
| Missing weekly running history or longest recent session | `policy_gap` | No approved method exists to infer a compatible starting load. |
| Reported continuous capacity below continuous programme Week 1 C | `policy_gap` | The mismatch is recorded, but the draft policies provide no reviewed decision rule. |
| All supplied inputs appear compatible | `policy_gap` | There is still no reviewed starting-workload compatibility rule. |

## Rules that require qualified-coach review

The next versioned personalization policy needs explicit, reviewable rules for:

1. Mapping recent weekly time/distance, longest session, and continuous-running evidence to a starting stage.
2. Determining when a runner advances, repeats, or regresses a stage.
3. Handling partial completion, missed sessions, interruption duration, and return after interruption.
4. Defining how reported effort, fatigue, discomfort, and recovery affect a later session.
5. Determining whether and how any programme can be shortened, delayed, or aligned to a goal date.
6. Resolving contradictory history (for example, high weekly minutes with a very short stated longest run).

Each rule must identify the target population, source or original-candidate status, exact policy ID/version, reviewer, review date, limitations, and release decision. A generic percentage progression is not a substitute.

## What the code validates now

- Exact immutable pack and personalization-policy references.
- All 36 sessions, fixed arithmetic, warm-up/cooldown, Week 4/8 recovery structure, 5K event handling, and recovery spacing.
- No production activation for any draft pack or pathway.
- Explicit `policy_gap` instead of silent workload personalization.

It does not establish medical fitness, injury risk, individual workload compatibility, or public-release readiness.
