# AiSensei product contract (Phase 0)

## Release slice

AiSensei is an offline, adult, first-half-marathon **completion planner**. Its first release supports one candidate pathway: a 16-week, three-running-days-per-week half-marathon template. This is a content brief, not approved training content and not a promise that 16 weeks, or having run 5K, makes a runner eligible.

The supported loop is: collect a starting point → assess eligibility → preview and activate a plan → view today's action → record an actual result → resolve an unlogged session → review a supported future-plan adjustment → accept an immutable new plan revision.

The release intentionally excludes GPS, watch/activity imports, runtime AI or chat, cloud accounts, payments, social features, meal plans, and full-marathon plans. It must work offline after installation. Local-only storage does not imply encrypted storage or immunity from device backups.

## Intended cohort and required inputs

The intended cohort is adults seeking a completion-focused half-marathon pathway who can supply the baseline information required by an approved template. The application does not assess medical readiness or provide clearance.

Required inputs before eligibility can be evaluated:

- Recent running history over the template-defined lookback period: weekly running amount, recent longest session and its date, and comfortable running duration.
- Training frequency (this release requires the candidate three-run variant), recent interruption details, and any reviewed screening answers.
- Goal mode: a fixed race date or a flexible half-marathon-distance goal; planned start date; display unit; and explicit IANA training timezone.
- Availability: runnable days, whole-session minute limits, preferred long-run day, and known unavailable dates.

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
| `eligible` | A reviewed, supported template and schedule pattern meet all declared constraints. | Preview assumptions and allow activation. |
| `insufficient_information` | A required baseline, goal, or availability input is absent or invalid. | Explain the missing input. |
| `needs_base_build` | The declared baseline does not meet the approved template's entry requirements. | Explain that a half-marathon plan is not offered yet; offer no invented bridge plan. |
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
