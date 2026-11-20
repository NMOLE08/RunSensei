# Half-marathon parameterized draft policy — v0.2.0

Status: **draft-only, research-only, and release-blocked**. This document records candidate engineering rules for qualified coaching review. Passing automated tests does not establish coaching, clinical, or injury-safety approval.

## Source and ownership

- Policy: `runsensei.half_marathon.parameterized_personalization@0.2.0-draft`
- Versioned source: `PolicyPack/half_marathon/07_parameterized_personalization_policy_v0.2.0_draft.json`
- Context references: the three NYRR half-marathon references listed in the policy JSON.
- The formulas below are original RunSensei candidate rules. They are not copied NYRR prescriptions and are not presented as coach-reviewed.

## Candidate calculation rules requiring review

| Area | Candidate rule | Status | Reviewer decision |
|---|---|---|---|
| Evidence recency | Longest-session observation must be no more than 28 days old when an as-of date is available. | Original candidate | Approve / modify / reject |
| Foundation entry | Weekly ≥90 min, longest session ≥40 min, comfortable running ≥20 min, 3 days. | Original candidate | Approve / modify / reject |
| Established entry | Weekly ≥150 min, longest session ≥60 min, comfortable running ≥30 min, 4 days. | Original candidate | Approve / modify / reject |
| Starting weekly workload | Clamp reported weekly minutes to 90–135 (foundation) or 150–210 (established), rounded to 5 min. | Original candidate | Approve / modify / reject |
| Starting long run | Clamp reported longest session to 40–55 (foundation) or 60–80 (established), rounded to 5 min. | Original candidate | Approve / modify / reject |
| Ten-week progression | Apply authored multipliers `1, 1.1, 1.2, 0.9, 1.3, 1.4, 1.5, 1.1, 1.2, 1`. | Original candidate | Approve / modify / reject |
| Recovery / taper | Recovery weeks 4 and 8; taper/event week 10. | Original candidate | Approve / modify / reject |
| Event | 21,097.5 m self-paced event; duration remains unknown. | Event distance is factual; surrounding plan is candidate | Approve / modify / reject |

## Current engine behavior

The deterministic generator uses evidence to calculate a seed workload, then applies policy multipliers to create all ten weeks. It checks every scheduled week for arithmetic, authored duration, day limits, unavailable dates, recovery spacing, reduced recovery weeks, final event integrity, and fixed-date compatibility.

It returns explicit non-prescription states rather than making a plan when appropriate:

- `requires_foundation_phase`
- `insufficient_evidence`
- `outdated_evidence`
- `conflicting_evidence`
- `two_day_half_marathon_policy_not_authored`
- `goal_date_infeasible`
- `unsupported_preparation_duration`
- `health_hold`
- `interruption_requires_review`

No two-day plan, automatic adaptation, distance-to-time estimate, or pace target is created.

## Release blockers

1. Qualified coach review and approval of every row above.
2. New immutable approved policy version(s), rather than changing `0.2.0-draft`.
3. Release authorization in the exact policy registry.
4. Review of source permissions and original-content provenance.
5. Separate authorization before any imported Strava data is used in live coaching decisions.
6. Android and release-build verification of the experimental preview remains separate from production activation.
