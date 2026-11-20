# RunSensei product contract (rolling-week scope)

> Phase 0 product direction, current branding, mentor roles, and the multi-distance rollout are documented in [product-direction.md](product-direction.md). This historical/technical contract retains legacy names and policy references where they are part of compatibility or provenance.

## Release slice

RunSensei combines an offline-capable GPS activity recorder with an opt-in rolling coaching framework. A long-term goal may span multiple months, but the planner may generate, preview, accept, and activate only **one consecutive seven-day window** at a time. Future phase state may be retained; future workout prescriptions must not be generated ahead of that window.

The supported loop is: collect a source-tagged starting point → assess goal/content compatibility → preview exactly seven dates → accept an immutable revision → view today's action → record actual activity separately → resolve unlogged sessions → review a supported future-only change → explicitly accept or reject it → generate the next week only after the current week is reviewed.

The installed content remains synthetic demo content. There is no reviewed production training template or numerical policy, so real coaching activation remains blocked. GPS recording and optional Supabase identity already exist and must remain usable without a coaching plan. Strava-derived data is excluded from planning/model input unless separate provider permission is documented. The local Qwen runtime is scaffolding until a compatible model is loaded and verified on a physical device; deterministic validation remains authoritative. Local-only storage does not imply encrypted storage or immunity from device backups.

## Intended cohort and required inputs

The eventual intended cohorts are defined by independently reviewed, versioned content. Current 5K, 10K, and half-marathon completion structures are development fixtures only. Marathon, start-running, speed-improvement, and other unsupported goals must return an explicit unsupported/content-gap state rather than borrow another goal's template. The application does not assess medical readiness or provide clearance.

Required inputs before eligibility can be evaluated:

- Recent running history over the template-defined lookback period: weekly running amount, recent longest session and its date, and comfortable running duration.
- Four source-tagged recent weeks (values may remain explicitly unknown), a current repeatable longest session, comfortable running duration, running experience, recent interruption details, and screening answers.
- Goal kind and event, current performance separately from aspirational target performance, fixed/flexible timing, planned start date, display unit, and explicit IANA training timezone.
- Availability: runnable days, whole-session minute limits, preferred long-run day, and known unavailable dates.
- Training volume/difficulty preferences and optional caps. Preferences select only among authored choices and cannot override safety or policy constraints.

An optional timed effort may be recorded only as a user-provided fact; it must not force a maximal test or imply race pace. Planned work uses time and effort cues unless an approved template specifically authorizes distance.

## Goal modes

| Mode | Meaning | Required result |
| --- | --- | --- |
| Fixed date | The runner supplies a calendar race date. | Check the selected reviewed template's duration, protected taper, availability, and start date. Do not silently compress, extend, or infer a finish time. |
| Flexible goal | The runner supplies the half-marathon distance goal without a race date. | Offer only a compatible reviewed template and expose its authored duration; no race date is fabricated. |

Dates are calendar dates, not UTC-midnight timestamps. Changing either goal mode or race date preserves recorded history and requires fresh validation of future recommendations.

## Eligibility and unsupported outcomes

Eligibility is template selection plus template-defined entry checks, not a health or injury score. The product must return a named result rather than fabricate a schedule.

| Result | When returned | User-facing direction |
| --- | --- | --- |
| `eligible` | In production, a reviewed supported template and schedule pattern meet all constraints. In development, this code may identify a visibly labelled compatible demo fixture. | Preview exactly seven dates and allow only the matching activation mode. |
| `insufficient_information` | A required baseline, goal, or availability input is absent or invalid. | Explain the missing input. |
| `needs_base_build` | Reserved for a future reviewed policy that explicitly identifies a supported foundation pathway. It is not triggered by a manual “I match the template” answer. | Offer the authored foundation pathway when one exists; otherwise explain the unsupported content gap. |
| `goal_date_incompatible` | A fixed date cannot fit the reviewed template, protected taper, or other authored date rules. | Ask for a different date/start choice or an approved alternative. |
| `availability_incompatible` | No template-allowed weekly pattern fits days, minutes, exceptions, long-run preference, and recovery spacing. | Ask for availability changes or a supported variant. |
| `unsupported_goal` | Distance, frequency, cohort, or goal type is outside the release's reviewed scope. | State the supported scope. |
| `health_hold` | A reviewed concern flag or pause workflow requires reassessment. | Suppress workout actions and reminders; show the approved support/reassessment path without diagnosis or clearance. |
| `needs_reassessment` | A sustained interruption, several weeks away, or stale current validation requires fresh assessment. | Preserve the prior plan for inspection; do not reactivate it automatically. |
| `no_reviewed_content` | No reviewed original template/policy is available. | Allow a visibly demo-only preview in development; block real-plan activation. |

## Product invariants

- No result predicts completion, sets race pace from a desired finish time, creates catch-up mileage, or turns an unresolved session into a proven miss.
- Planned prescriptions and actual activity are distinct. Unknown distance is unknown, never zero; no heart rate, route, readiness score, or other unprovided metric is invented.
- Acknowledged skips remain visible to interruption assessment. A missed long session requires the next long-session check to use actual history, according to reviewed policy.
- Every future change is a reviewable proposal with reasons, constraints, target-date effect, base revision, and input fingerprint. A stale proposal refreshes; repeated events cannot create duplicate changes.
- New facts immediately revalidate future recommendations. An incompatible active revision remains inspectable but is `needs_review` or `health_hold`; actionable workouts and reminders are suppressed.

## Release-content gate

Real training activation requires all of the following: `reviewState: "reviewed"`, `demoOnly: false`, a declared author and reviewer, a review date, rights/source notes, a compatible engine version, and a complete schema-valid policy/template pair. `draft`, `retired`, demo, incomplete, or mismatched content may be used only for development fixtures and must be visibly labelled. The original template author and qualified reviewer are a release dependency; engineering must not supply missing numbers.
