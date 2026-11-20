# Training-policy review package

Updated: 2026-10-31. Status: **engineering and research register only — no policy in this package is approved for product activation.**

## Decision record

RunSensei now has an immutable, exact-version policy-review catalog in `src/domain/training/policyReviewCatalog.ts`. Every bundled entry is `draft`, carries source/rights metadata, has no authored numerical formula, and returns `activation: blocked`. The Qwen generation entry point requires both a reviewed runtime policy and a matching release-ready review package; it cannot activate a plan from this register.

This is intentional. A public plan or a paper is evidence for a coach's review, not permission to copy a schedule and not a substitute for professional sign-off.

## Missing-policy inventory

| Requirement | Current status | What a qualified reviewer must provide |
| --- | --- | --- |
| Beginner walk/run entry and progression | Missing | Original, rights-cleared session rules, entry/re-entry criteria, and boundaries. |
| First/recreational 5K | Missing | Baseline bands, supported variants, complete weekly prescriptions, deload/taper rules. |
| First 10K | Missing | Same, plus long-session and fixed-date rules. |
| Half-marathon completion/improvement | Missing | Separate completion and performance cohorts, prerequisites, weekly structure, taper and interruption rules. |
| Marathon | Missing | Scope, established-base prerequisites, original content and full safety/return constraints. |
| Numerical workload, long-run, recovery, deload and taper rules | Missing | Formula, cohort, evidence, uncertainty, author and reviewer approval for each rule. |
| Post-interruption/re-entry content | Missing | Explicit gap categories and supported re-entry variants. |
| Rights to reproduce third-party schedules | Not established | Written license or newly authored original content. |

## Evidence register

These sources are review inputs only. Their schedules, tables, or numerical prescriptions are not copied into RunSensei.

| Evidence | Relevant coverage | Rights/reuse status | Accessed |
| --- | --- | --- | --- |
| [B.A.A. Boston Half training resources](https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/) | Phased half-marathon preparation and different experience levels. | Public guidance; source notice requires permission before reproduction/repurposing. | 2026-10-31 |
| [B.A.A. Boston Marathon training resources](https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/) | Established-base marathon preparation and phase structure. | Public guidance; no schedule reuse. | 2026-10-31 |
| [NYRR training](https://www.nyrr.org/train) | Training-resource discovery. | Access was queue-gated during verification; rights remain unconfirmed. | 2026-10-31 |
| [CDC intensity guidance](https://www.cdc.gov/physical-activity-basics/measuring/) | Plain-language relative-intensity and talk-test wording. | Reference for language only, not prescriptions. | 2026-10-31 |
| [PubMed running-load/injury systematic-review search](https://pubmed.ncbi.nlm.nih.gov/?term=running+training+load+injury+systematic+review) | Evidence discovery for workload/injury uncertainty. | Research reference only; heterogeneity prevents a universal progression rule. | 2026-10-31 |

## Candidate families and activation state

| Family | Intended cohort | Candidate evidence | Current activation |
| --- | --- | --- | --- |
| Beginner / first run-walk | Starting or returning adults | CDC; training-load literature | Blocked: no authored original progression. |
| First 5K | Adults preparing to complete a first 5K | CDC, NYRR discovery, literature | Blocked. |
| Recreational 5K | Established recreational runners | CDC, NYRR discovery, literature | Blocked. |
| First 10K | Adults preparing for a first 10K | CDC, NYRR discovery, literature | Blocked. |
| Half-marathon completion | Adults preparing to complete a half marathon | B.A.A., NYRR, literature | Blocked. |
| Half-marathon improvement | Experienced runners with performance goal | B.A.A., NYRR, literature | Blocked. |
| Marathon completion | Runners with an established base | B.A.A., literature | Blocked pending scope and original content. |

## Numerical-rule authoring worksheet

The beginner-to-5K candidate below is the sole exception: it is an engineering-authored draft with explicit values awaiting qualified coach review. All other families remain unwritten. Every future populated rule must retain its exact formula/threshold and versioned source/content basis.

| Topic | Required formula/threshold | Population | Evidence | Limitations to record | Implementation outcome until approved |
| --- | --- | --- | --- | --- | --- |
| Baseline compatibility | **Unwritten** | Family-specific | Family evidence | Self-report uncertainty, missing history | `insufficient_information` or `no_reviewed_content`. |
| Weekly workload | **Unwritten** | Family-specific | Literature + authored policy | Avoid universal percentage claims | No workload escalation. |
| Long-session progression | **Unwritten** | Family-specific | Literature + authored policy | Actual completed work, not elapsed calendar | No automatic long-run increase. |
| Recovery spacing | **Unwritten** | Family-specific | Authored schedule | Week-boundary and unavailable-day effects | Reject unsupported structure. |
| Deload/recovery week | **Unwritten** | Family-specific | Authored policy | Must be explicit in content | No inferred deload. |
| Taper | **Unwritten** | Race-specific | Authored policy | Fixed-date protection | No compression or late catch-up. |
| Interruption return | **Unwritten** | Family-specific | Authored policy | Health concerns remain separate hold | `needs_reassessment`. |
| Pace guidance | **Unwritten** | Runners with reliable evidence | CDC language + authored policy | Target time is not ability evidence | Relative effort only; pace omitted. |

## Candidate beginner-to-5K policy — `beginner-to-5k-candidate@0.1.0-draft`

**Status:** Draft, development-preview only. It is original RunSensei candidate content, not reviewed coaching advice. The app never persists it as a real plan.

### Intended population and entry boundary

- Adult first-5K candidates with no current concern flag and no sustained interruption.
- Known four-week recent weekly minutes, known comfortable duration of at least 20 minutes, and known repeatable longest session of at least 20 minutes.
- Three selected run days with at least one full rest day between sessions, including across Sunday/Monday; each day must allow at least 25 minutes.
- A fixed race date must be at least 56 calendar days from the requested first week. This candidate does not prescribe a race-week taper or race execution.
- Unknown, insufficient, or contradictory baseline data returns an unavailable result. An aspirational finish time never affects the tier or pace.

### Eight authored candidate stages

| Candidate week | Three-session total | Longer session | Structure | Purpose |
| --- | ---: | ---: | --- | --- |
| 1 | 84 min | 31 min | 1 min run / 2 min walk repeats | Establish an easy repeatable run-walk pattern. |
| 2 | 84 min | 31 min | Same authored introductory stage | Confirm the response before progression. |
| 3 | 94 min | 34 min | 2 min run / 2 min walk repeats | Extend relaxed running intervals. |
| 4 | 84 min | 31 min | Return to introductory stage | Explicit candidate deload; no percentage formula. |
| 5 | 94 min | 34 min | Build run-walk stage | Resume only the prior authored stage. |
| 6 | 96 min | 40 min | 3 min run / 2 min walk repeats | Transition toward longer continuous easy work. |
| 7 | 96 min | 40 min | Same transition stage | Consolidate, not automatically escalate. |
| 8 | 95 min | 40 min | Easy continuous-run option for established baseline | Candidate completion transition; no race prescription. |

The current implementation chooses only one seven-day window. A `comfortable` difficulty preference can retain the preceding authored stage; a `challenging` preference never advances beyond the authored week. This is an explicit candidate choice, not a general rule of progression.

### Workout library and effort

Every session has a five-minute warm-up and cooldown. Candidate run-walk work uses an easy RPE 3–4 / full-sentence conversational cue. Candidate recovery work uses RPE 2–3 / very easy. No pace target is produced, even with a target 5K time.

| Tier | Standard | Longer | Recovery |
| --- | --- | --- | --- |
| Intro | 6 × (1 min run + 2 min walk), 28 min total | 7 × (1 + 2), 31 min | 5 × (1 + 2), 25 min |
| Build | 5 × (2 + 2), 30 min | 6 × (2 + 2), 34 min | 5 × (2 + 2), 30 min |
| Transition | 4 × (3 + 2), 30 min | 6 × (3 + 2), 40 min | 4 × (2 + 2), 26 min |
| Continuous | 20 min easy main, 30 min | 30 min easy main, 40 min | 15 min very-easy main, 25 min |

The deterministic validator checks every warm-up/main/walk/recovery/cooldown component, repeated-step arithmetic, weekly limit, exact three-session frequency, one longer session, availability, and calendar spacing.

### Candidate response to outcomes

- An explicit missed session or harder-than-expected session does not create a make-up session; it returns `repeat_current_week` for a future reviewed preview.
- A concern flag returns `health_hold`; a sustained interruption returns `needs_reassessment`.
- Completed, partial, and skipped facts remain separate from prescriptions. The candidate does not infer a result from missing feedback.

### Rule evidence, rationale, and limitation

| Candidate rule | Evidence input | Engineering rationale | Limitation / reviewer decision needed |
| --- | --- | --- | --- |
| Run-walk start and conversational cue | CDC relative-intensity language | Keeps early sessions time/RPE-based rather than pace-based. | CDC does not approve this program or its numbers. |
| Three spaced sessions | Training-load/injury literature search | Enables an explicit cross-week recovery check. | Calendar rest does not measure individual recovery. |
| Authored stages and week-four return | Original candidate content informed by workload uncertainty | Avoids an unbounded weekly percentage increase. | Coach must decide whether stage totals suit the intended population. |
| 56-day fixed-date boundary | Original content-scope boundary | Refuses compressed candidate plans. | It is not a readiness assessment or taper policy. |
| Missed-workout repeat/no catch-up | Product safety contract and workload uncertainty | Prevents repayment debt. | Coach must provide an approved re-entry protocol. |

## Reviewer approval checklist

Before a policy version becomes `reviewed` and `eligible_after_release_review`, a qualified running coach must confirm all of the following:

1. The author, reviewer, date, credentials/approval scope, content ownership, and engine compatibility are recorded.
2. Each numerical rule has an exact formula or threshold, a defined runner population, source references, limitations, and an implementation rationale.
3. Each workout option has an original complete prescription: warm-up, main work, repeats/recoveries where applicable, cooldown, purpose, effort cues, total duration/distance, approved alternatives, and unit semantics.
4. Eligibility, goal-date feasibility, session time limits, availability patterns, weekly load, independent long-session changes, recovery spacing across Sunday/Monday, deloads, taper, missed sessions, and interruption/re-entry cases are covered.
5. Pace targets require an authored permission rule and reliable current evidence; aspirational target times do not count.
6. The reviewer has checked that all displayed wording makes no medical-clearance, safety, performance, or completion guarantee.
7. Validation fixtures cover accepted and rejected examples, including a health hold, sparse baseline, incompatible date, insufficient days, and unavailable historical policy version.
8. A new immutable policy/template version is released; existing plans remain pinned to the old policy and prescription snapshot.

## Activation flow once content is approved

`validated runner profile → fitness analysis → exact reviewed policy package + runtime workout rules → Qwen seven-day proposal → deterministic validation → preview → explicit acceptance → SQLite revision`

The local model receives only allowlisted RunSensei-native/user-provided facts. Strava-origin data remains prohibited. Qwen may choose and structure within approved options; it cannot expand the policy, write SQLite, or bypass user acceptance. Only seven consecutive dates are generated.

## Performance baseline

On the tested Android phone, the all-rest full-schema diagnostic took 85.9 seconds: 998 generated tokens in 75,701.707 ms. The immediate next optimization work is to compact policy IDs/parameters and reduce redundant prompt fields while preserving schema completeness and deterministic validation. No performance optimization authorizes weaker policy validation.
