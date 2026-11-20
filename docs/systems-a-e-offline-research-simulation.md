# Systems A–E offline research simulation

Status: **research only — no production plan is created, changed, or activated.**

The deterministic harness at `src/domain/research/runBeginner5kResearchSimulation.ts` runs the strict user-facing gate first. Its `policy_gap` result is retained; the harness does not reinterpret it as authorization. It then evaluates a separately labelled draft candidate, renders the exact draft policy pack, validates it, analyses fixture outcomes, evaluates a draft System E decision, and optionally creates a non-actionable Phase 2 preview.

## Run/walk complete scenario

| Step | Result |
| --- | --- |
| Fixture | `run_walk-completed_week-flexible` |
| Strict user-facing gate | `policy_gap` — draft compatibility rules are not production authority |
| Research candidate | `candidate_compatible_draft_only` |
| System C | Original 36-session run/walk simulation structurally valid, draft-only |
| System D | Three completed outcomes; no invented running duration, distance, or pace |
| System E | `advance_candidate` under draft rules |
| Preview | Unchanged 36-session draft preview; no new prescription |

## Continuous-running partial scenario

| Step | Result |
| --- | --- |
| Fixture | `continuous-partial-flexible` |
| Strict user-facing gate | `policy_gap` — production remains blocked |
| Research candidate | `candidate_compatible_draft_only` |
| System C | Original 36-session continuous-running simulation structurally valid, draft-only |
| System D | One partial plus two completed outcomes; actual step-level running time remains unknown unless recorded |
| System E | `repeat_candidate`, with no make-up workload |
| Preview | 39-session, 13-week draft only; one exact authored stage copied, final 5K event remains exactly once |

The repeat preview displays an event-date effect for flexible goals and carries these review warnings:

- `modified_progression_requires_qualified_coach_review`
- `accumulated_training_workload_changed_requires_review`
- `protected_recovery_week_displaced_requires_review`

For fixed goals, the same repeat is rejected with `fixed_goal_date_repeat_conflict`.

## Integrity checks exercised

- Immutable policy and pathway references remain attached to every source session.
- Strict user-facing gate remains blocked; research compatibility is never labelled approved coaching.
- Corrected outcomes are counted once; old versions remain historical evidence.
- Unreported is separate from missed.
- The final 5K event appears exactly once with a 5,000 m target and unknown duration.
- Re-running a fixture creates only new in-memory objects. The harness does not access SQLite, network APIs, Qwen, Strava, or production onboarding.

See `tests/domain/beginner5kResearchIntegration.test.ts` for all deterministic scenarios on both pathways.
