# Stage D Milestone 2A — Starting Workload Comparison

Implemented as a read-only comparison beside the existing beginner-5K calculated-foundation preview. No method is selected automatically. Estimates never replace the evidence passed to `generateFoundationProgram`. No assignment, outcome, schema, production gate, GPS, voice, package ID or signing changes are made.

## Proposal identity and calculations

`torto.foundation.starting_workload_comparison@0.1.0-draft` is an original research candidate, not a coaching authorization. It references `runsensei.foundation.multiweek@0.2.0-draft` for compatibility calculations only.

- Confirmed report: `S` running seconds.
- Observed mean: `floor(sum(Wi) / 4)`.
- Lower reference: `floor(min(S, Wlatest, median(W1,W2,W3,W4)))`.

Four consecutive complete Monday–Sunday runner-local windows must end before the target training week and before evaluation. This observation horizon is a product/research assumption, not a safety threshold or evidence-expiry rule. Fractional final seconds are floored; the numerator, denominator and unfloored median remain in the audit output. No time-to-distance conversion is used.

## Evidence ledger

`buildWeeklyEvidenceLedger()` preserves raw source IDs, correction lineage, per-session exposures, timezone, interruption context, coverage declarations and inclusion/exclusion reasons. Running, walking and GPS active elapsed subtotals remain separate. A missing walking duration is not inferred by subtracting running from elapsed time.

Coverage has four states:

- `complete`: explicit coverage statement plus supported running measurements for the recorded sessions.
- `confirmed_no_running`: explicit zero declaration without conflicting activity.
- `partial`: some observations exist, but the full week is not known.
- `unknown`: no sufficient coverage evidence.

Missing weeks are never dropped from the denominator. Partial totals remain labelled subtotals. An unreported outcome is unknown, not missed or completed. Confirmed missed sessions do not imply that the entire week contained no other running.

Corrections are resolved before aggregation. One linked GPS recording and research outcome contribute one session; the outcome can supply explicit running and the GPS record supplies elapsed time. Competing outcome associations are flagged instead of selecting one arbitrarily. Guided elapsed time never supplies actual running seconds.

Date-only records are not shifted through UTC. GPS instants are converted with the supplied IANA timezone. Existing research outcomes do not retain their original timezone: they remain visible under their recorded date, with `historical_observation_timezone_unrecorded` preventing complete-week comparability. Confirmation dates remain separate from observation windows.

## Important current application limitations

The application reads current-account saved research outcomes and saved tracker sessions. It does **not** create completeness declarations or invent training-episode membership from a confirmation timestamp.

Existing account records have no explicit full-week coverage or training-episode declaration. Therefore the confirmed-report estimate can be available while observed mean and lower reference remain unavailable. Full observed-history calculations are executable and tested with explicitly declared synthetic evidence. This milestone does not add a declaration form, database migration or import pipeline.

Standalone legacy activity logs not associated with a research outcome are not loaded as running evidence. Imported records and historical records are never treated as current capacity automatically.

## Compatibility, not prescriptions

For each available estimate, the analyzer uses the existing foundation integer-second distribution, walking warm-up/cooldown and recovery parameters. It passes only analytical occupied-time slots to the existing scheduler; it does not return these as generated workouts or assignments.

It checks explicit two/three-session frequency, continuous capacity, daily limits, unavailable dates, fixed goal dates, circular recovery, and observed prior-session recovery. It shows accumulated-session evidence gaps. Reported bout sequences can be retained, but neither a single continuous bout nor a weekly total authorizes repeated intervals. Even available bout evidence does not remove the missing reviewed compatibility rule.

Statuses are deliberately unresolved or conflicting where rules/evidence are missing. Fitting a calendar is not a fitness or safety determination. Health concerns remain visible and prevent treating an estimate as an actionable prescription.

## Debug example

Synthetic current report: `S = 3000` seconds. Four complete current-episode windows before Monday 2027-02-01:

| Window | Running seconds | Coverage source |
|---|---:|---|
| Jan 4–10 | 2400 | coverage0 |
| Jan 11–17 | 3000 | coverage1 |
| Jan 18–24 | 3600 | coverage2 |
| Jan 25–31 | 1200 | coverage3 |

1. Inspect each included session and its correction/activity identity.
2. Verify all four coverage statements, timezone and episode match.
3. Mean: `(2400 + 3000 + 3600 + 1200) / 4 = 2550` seconds = 42.5 minutes.
4. Sorted observations: `[1200,2400,3000,3600]`; median = 2700 seconds.
5. Lower reference: `min(3000,1200,2700) = 1200` seconds = 20 minutes.
6. UI displays **50 / 42.5 / 20 minutes**, plus a report/history difference finding. It does not call that difference a contradiction or select 20 minutes.
7. Existing week preview remains based on its original confirmed report: 50 running minutes plus 30 walking minutes for three continuous sessions. The comparison does not alter it.

Remove `coverage1`: its 3000 seconds become a partial subtotal, and both observed methods become unavailable. Confirming onboarding again does not repair the missing coverage.

## Android check (not physically verified)

Open the existing internal **Beginner 5K decision preview** in Research Foundation. Tap **Check weekly decision**, then expand **Starting Workload Comparison**. Verify dates, partial/unknown labels, three estimate columns, formula explanation, compatibility findings and the no-selection warning. Expand **Decision evidence and rules** to inspect the entire ledger, inputs and fingerprint.

The existing research feature gate and account requirement remain unchanged. No Gradle build was run.

## Changed files

- `PolicyPack/foundation/04_starting_workload_comparison_v0.1.0_draft.json`
- `PolicyPack/foundation/validate_starting_workload_comparison.py`
- `src/domain/planning/beginner5kRunnerEvidence.ts`
- `src/domain/planning/beginner5kStartingWorkload.ts`
- `src/domain/planning/beginner5kWeeklyDecision.ts`
- `src/application/beginner5kWeeklyPreview.ts`
- `src/features/execution/Beginner5kWeeklyPreview.tsx`
- `tests/domain/beginner5kStartingWorkload.test.ts`
- `tests/application/beginner5kWeeklyPreview.test.ts`
- `tests/application/beginner5kWeeklyPreviewIntegration.test.ts`
- `tests/features/beginner5kWeeklyPreview.test.ts`
- This document.

Remaining coaching decisions: baseline estimator authorization, evidence sufficiency, repeatable-bout compatibility, accumulated-session limits and progression/adaptation rules. None is authorized by software tests or this comparison proposal.
