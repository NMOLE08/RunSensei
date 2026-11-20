# Multiweek foundation implementation — initial checkpoint

Superseded implementation status: the Android adapter now consumes the four-week generator. Goal onboarding collects explicit two/three-session frequency, current foundation confirmation and post-break demonstration confirmation. The new fields are fingerprinted and included in account progress. The preview displays week navigation, separate running/walking totals, steps, recovery and retained ultimate goal. Scheduling now searches weekday subsets across all weeks. See `artifacts/foundation/multiweek/` for complete synthetic adapter outputs and `PolicyPack/foundation/validate_foundation.py` for the new policy contract validator.

Android retest: use the existing experimental development flag, edit Goal, select frequency and truthfully confirm current evidence, save/reassess, then open Plan and navigate all four weeks. A 50-minute three-session baseline gives 50/53/56/50 running minutes plus 30 walking minutes weekly. A two-session baseline gives 50/52/54/50 plus 20 walking minutes; its sessions are 35/36/37/35 minutes, so a complete four-week preview needs confirmed 37-minute limits (35 minutes fits Week 1 only). 30-minute daily limits must block. Restart and revisit Plan to confirm stable results. No native rebuild is required. Physical Android verification has not been performed for this integration.

## Frequency persistence repair — verified in automated checks

An older account may legitimately have current foundation evidence but no saved `foundationFrequency`, because that explicit selection was introduced after its onboarding draft. The preview previously mapped that absence to `0`; `generateFoundationProgram()` then returned `foundation_frequency_policy_gap` at its supported-frequency check. This was an onboarding-to-preview mapping defect, not a missing policy.

The restored draft now normalizes a missing field to `null`; the generator returns the distinct `foundation_frequency_required` result. The Plan card says **Choose your weekly training frequency** and opens the exact Goal-step control. Selecting two or three sessions is locally persisted, included in the account-owned remote answer payload and assessment evidence fingerprint, then reassessed before the preview runs. The frequency is never inferred from available weekdays. A valid two- or three-session selection proceeds to scheduling; an insufficient confirmed daily limit produces `session_exceeds_time_limit` instead.

Evidence: TypeScript and ESLint pass; targeted integration tests pass (8 suites, 55 tests); full Jest passes (70 suites, 387 tests); both policy validators pass. Physical Android retesting of this repair remains required.

Remaining limitations: conditional future stages require reassessment; no automatic advancement or measured goal transition is implemented. Zero-evidence beginner, higher-frequency and health-related return prescriptions remain unsupported. No production persistence or activation is enabled. The earlier checkpoint below records the starting state, not current integration status.

The original current-running-week@0.1.0-draft remains unchanged. The new `runsensei.foundation.multiweek@0.2.0-draft` is an original numerical candidate with no coach approval or production authorization.

## Implemented domain slice

Four conditional stages, explicitly requested frequencies of two or three, current demonstrated running evidence, timed walk-run intervals for beginners and non-health returners, generic scheduling, independent arithmetic/spacing/provenance checks, and reassessment required after stage four.

The proposed per-session additions are 0/60/120/0 seconds over the four stages; stage four restores initial running workload. Warm-up/cooldown are each 300 walking seconds; interval recovery is 60 walking seconds. These are original assumptions, not externally validated prescriptions. Every parameter, frequency, entry condition, and transition requires qualified review. Future stages are illustrations and must not authorize advancement based only on elapsed time.

For 50 confirmed weekly minutes over three sessions, weekly running is 50/53/56/50 minutes and total time is 80/83/86/80 minutes. Current continuous capacity must support each proposed continuous session. Historical longest sessions and length of interruption are not workload inputs.

## Outstanding acceptance work

- Physical Android retest of the persisted frequency repair, account restart, and four-week navigation.
- Add rendered-preview coverage and extended returning-runner evidence cases where separately authorized.
- Goal transition is a reassessment requirement only; actual measured milestones and exact goal-policy selection remain to be implemented.
- Higher-frequency numerical policies remain absent. Additional available days are scheduling options, not automatic extra sessions.

Do not mark the requested multiweek Android milestone complete. No production plans, assignments, history, or remote workout records are written by the new pure function.
