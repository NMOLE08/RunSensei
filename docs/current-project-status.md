# Torto — Current Project Status

**Status snapshot:** 2026-11-20  
**Source of truth for this document:** the current local workspace at `D:\Projects\AiSensei`, including uncommitted files. This is not limited to the Git commit history.  
**Purpose:** explain what Torto can currently do, what is implemented but not yet field-validated, what is research-only, and what remains before a public coaching release.

**Phase 0 product direction:** Torto is the product, Sensei is the coaching experience, and Moss/Jett are its two mentors. See [product-direction.md](product-direction.md) for the implementation boundary and rollout order.

## Executive summary

Torto is currently an **internal alpha running tracker with advanced research-grade coaching infrastructure**.

The strongest implemented area is the technical running foundation: GPS recording, active-time tracking, persistence, history, pause/resume lifecycle work, live metrics, kilometre splits, guided-workout infrastructure, and field diagnostics. The central remaining risk is **real outdoor Android validation**, especially distance and pace accuracy under actual GPS conditions.

The second strongest area is **beginner 5K research and policy tooling**: onboarding, assessment, evidence normalization, weekly evidence confirmation, deterministic preview generation, policy provenance, and controlled plan publication paths. Much of this code intentionally declares itself `researchOnly` and/or `productionEligible: false`; it must not be described as a released automatic coaching product.

Torto is **not yet a production half-marathon/full-marathon coaching app**, even though the onboarding and research code contain those goals. The half-marathon path is explicitly a draft simulation, and broad production capabilities such as payments, complete coach conversations, race-day support, device integrations, and reviewed training content remain unfinished.

## Status labels

| Label | Meaning |
| --- | --- |
| **Implemented** | Present in source and connected to the application flow. It may still need device or release validation. |
| **Internally verified** | Implemented with automated tests and/or source-level verification. This does not prove Android behaviour. |
| **Field validation pending** | Requires outdoor Android evidence, physical-device interaction testing, or operational review. |
| **Research-only / gated** | Deliberately prevented from becoming a production training recommendation or active plan. |
| **Planned** | Not yet implemented as a complete user capability. |

## Current product maturity

| Product area | Current maturity | Honest description |
| --- | --- | --- |
| Standalone run tracking | Internal alpha | Core implementation exists; outdoor accuracy and reliability acceptance remain pending. |
| GPS metrics and diagnostics | Internal alpha, field-testing stage | Versioned metric evidence, quality states, split persistence, lifecycle recovery, and diagnostic export exist. The real cause of observed pace/distance issues still requires measured outdoor evidence. |
| Workout history | Early beta-quality foundation | Local persistence and History views exist, but full cross-device/cloud product behaviour is not complete. |
| Guided workouts and voice cues | Internal preview | Execution and cue infrastructure exist, but the current contract explicitly marks guided execution as not production eligible. |
| Beginner 5K coaching | Research prototype / controlled internal workflow | Deep deterministic evidence and policy work exists. Some publication paths exist, but research and policy gates remain. |
| Half-marathon coaching | Research simulation | Draft, non-production simulation only. No claim of released coaching support. |
| Full marathon coaching | Planned | No completed production pathway found. |
| Mascot coaches | Internal feature foundation | Jett/Moss assets, selection, speech/lip-sync infrastructure and developer lab exist; the full coaching personality system does not. |
| AI coaching | Experimental | Local-model and structured-planning scaffolding exist; deterministic validation remains authoritative and production capability is not established. |
| Public commercial product | Not ready | Billing, support operations, legal/compliance completion, production content approval, and release validation remain. |

## What is implemented now

### 1. Running tracker and workout execution

**Implemented or internally verified**

- Foreground and background location-task architecture, tracking sessions, active-time segments, manual pause/resume/finish, persistence, recovery work, and local History.
- Live dashboard inputs for active time, distance, average pace, rolling pace, GPS quality, completed kilometre splits, partial kilometres, and guided phase information.
- Versioned metric evidence and persisted metric edges/splits for newer tracking versions. Legacy metrics remain preserved rather than retroactively rewritten.
- GPS-quality and refresh-health contracts that distinguish a weak/stale GPS signal from an incomplete saved-metrics refresh.
- Local diagnostic collection/export intended to investigate distance undercounting without logging ordinary route coordinates.
- Dedicated internal diagnostic build configuration is present, designed to bundle JavaScript/assets and run without Metro after installation.
- Standalone, planned, and guided recording screens reuse shared tracking concepts rather than inventing separate pace/distance algorithms.

**Important files**

- `src/application/workoutTracker.ts`
- `src/application/backgroundGpsTask.ts`
- `src/application/liveRunMetrics.ts`
- `src/domain/tracking/liveRunMetrics.ts`
- `src/data/trackingMetricsRepository.ts`
- `src/application/gpsDiagnostics.ts`
- `src/features/execution/LiveWorkoutDashboard.tsx`
- `src/features/execution/GuidedFoundationWorkoutScreen.tsx`

**Still required before claiming reliable tracking**

- Repeatable measured outdoor-route validation for distance and pace.
- Stationary drift, slow-walk, pause-with-movement, resume, weak-signal, screen-lock, app-switch, finish/restart, and History consistency tests on real Android hardware.
- Inspection of exported diagnostic evidence from the affected physical device.
- Confirmation that diagnostic-enabled release APK installation preserves existing app data under the intended signing certificate.

### 2. Onboarding, assessment, and runner evidence

**Implemented or internally verified**

- Question-by-question onboarding presentation with persisted local drafts.
- Goal selection for habit, 5K, 10K, half marathon, and marathon; supported goals must still pass downstream policy/content gates.
- Running-history, availability, date, unit, timezone, interruption, and assessment inputs.
- Native date inputs, weekly-distance wheel/manual entry, conditional questions, focused navigation, and draft restoration work.
- Account-scoped weekly evidence declarations and append-only confirmation revisions for beginner 5K research.
- Explicit distinction between complete evidence, confirmed no-running, partial evidence, and unknown/withdrawn declarations.

**Key safety boundary**

Empty activity evidence is not automatically treated as a confirmed no-running week. Unknown evidence remains unknown.

**Important files**

- `src/app/onboarding/[step].tsx`
- `src/features/onboarding/questionFlow.ts`
- `src/data/onboardingDraftRepository.ts`
- `src/application/fitnessAssessmentOnboarding.ts`
- `src/application/beginner5kWeeklyPreview.ts`
- `src/data/researchWeeklyEvidenceRepository.ts`

### 3. Beginner 5K planning and policy work

**Implemented or internally verified**

- Deterministic beginner 5K candidate/pathway evaluation.
- Foundation-program generation and research-block reassessment flows.
- Starting-workload comparison models based on evidence windows and coverage declarations.
- Policy/version references, explicit eligibility/reason codes, scheduling/availability checks, policy-readiness checks, and evidence provenance.
- Policy-authorized publication infrastructure for explicitly authorized policy weeks.
- Plan availability and preview UI states that distinguish user-actionable missing data from policy/release blockers.

**Research-only / gated areas**

- Weekly evidence previews and starting-workload calculations explicitly return research-only, non-production results.
- Draft 5K foundation and continuous-running policies are intentionally non-production.
- No automatic starting-workload selection, progression, reduction, or adaptation should be assumed from preview code alone.
- The running-plan engine must not silently transform research comparisons into prescriptions.

**Important files**

- `src/domain/planning/beginner5kWeeklyDecision.ts`
- `src/domain/planning/beginner5kStartingWorkload.ts`
- `src/domain/planning/beginner5kPolicyReadiness.ts`
- `src/domain/planning/beginner5kPublicationPolicy.ts`
- `src/application/beginner5kPublication.ts`
- `src/application/consumerPlanStatus.ts`

### 4. Half marathon and other distance goals

**What exists**

- The onboarding flow can collect these goals.
- A half-marathon research simulation, return-readiness assessment, policy-pack references, and availability checks exist.
- The general scheduling/policy architecture has concepts reusable across distance families.

**What does not exist as a released capability**

- The half-marathon simulation is explicitly `researchOnly: true` and `productionEligible: false`.
- Its policy lifecycle is draft and `releaseAuthorized: false`.
- No verified public full-marathon coaching pathway was found.
- No product claim should say that Torto currently delivers a professionally reviewed HM/full-marathon plan.

**Important file**

- `src/domain/planning/halfMarathonDraft.ts`

### 5. Plans, calendar, and History

**Implemented or internally verified**

- Plan calendar, active-plan state, date navigation, weekly workout presentation, session detail routes, and History routes.
- The Plan screen preserves the difference between an active/approved plan and a preview/research state.
- Workout display components draw from stored assignments and execution view models rather than changing authored prescriptions for presentation.

**Current limitation**

The default product mode is tracker-first. The tab layout currently emphasizes **Run, Plan, and History**, not the complete five-area coaching application described in the product blueprint.

**Important files**

- `src/app/(tabs)/plan.tsx`
- `src/app/(tabs)/history.tsx`
- `src/app/(tabs)/index.tsx`
- `src/features/execution/viewModel.ts`
- `src/config/productMode.ts`

### 6. Coach mascots and audio

**Implemented or internally verified**

- Jett and Moss asset mappings and coach selection.
- Talking-mascot playback and lip-sync timing infrastructure.
- Developer-only Talking Jett laboratory for playback/synchronization observation.
- A foundation for coach introductions without forcing mascot tooling into core tracker flows.

**Still planned**

- Full persistent coach relationship, narrative/story progression, adaptive conversational coaching, verified transcripts/subtitles, and production animation/accessibility acceptance.

**Important files**

- `src/features/coaches/CoachSelection.tsx`
- `src/features/coaches/TalkingMascot.tsx`
- `src/features/coaches/useCoachIntroduction.ts`
- `src/features/developer/TalkingJettLab.tsx`
- `src/domain/talkingMascotPlayback.ts`

### 7. Authentication, accounts, and data controls

**Implemented or partially implemented**

- Supabase-auth application scaffolding and optional account flows.
- Account-scoped records in newer repositories/migrations.
- Local guest/tracker identity approach.
- Account data controls, export/deletion service paths, and ownership isolation tests in several subsystems.

**Still required**

- Complete device migration/cloud-sync policy and testing.
- Full recovery/verification and support-operational validation.
- A public privacy/security review appropriate for the final data model and release channels.

### 8. Integrations, notifications, and AI

| Capability | Current status |
| --- | --- |
| Local notifications/reminder reconciliation | Underlying services exist; complete product flow and device delivery acceptance remain incomplete. |
| Strava connection | Gated groundwork exists. Activity viewer and plan personalization are explicitly disabled. |
| Wearables/Health Connect/Apple Health | Planned; no complete public integration found. |
| Calendar/treadmill/watch execution | Planned or partial infrastructure only; not a completed release capability. |
| Local Qwen model support | Experimental/on-device scaffolding exists; needs actual model/device verification before product claims. |
| Automated coaching adaptation | Research/prototype work exists; not authorized as automatic production coaching. |

## What is deliberately blocked from production

The project has several good safety gates. These are intentional product protections, not missing buttons:

- Draft, synthetic, incomplete, or unreviewed coaching policies must not activate real training plans.
- Research-only beginner 5K comparisons must not automatically become prescriptions.
- Half-marathon simulations must not be presented as active reviewed plans.
- Strava-derived activity import/personalization is disabled pending product authorization and secure service completion.
- Local AI output must pass deterministic validation and does not replace reviewed policy decisions.
- GPS metrics should not be treated as trustworthy on the affected device until field diagnostics and measured-route tests are complete.

## Major work remaining

### Highest priority: make the tracker trustworthy on physical Android

1. Build/install the dedicated diagnostics APK using the existing internal build process.
2. Run the documented outdoor route tests and export diagnostics for failures.
3. Determine whether undercounting comes from device permissions, native delivery frequency, filtering, background lifecycle, persistence refresh, or an implementation defect.
4. Tune or correct only after evidence identifies the cause; do not artificially alter pace/distance to look plausible.
5. Repeat the full physical acceptance matrix before general beta use.

### Next: complete one safe coaching loop

1. Select one supported cohort and distance family.
2. Obtain qualified review and release authorization for exact policies and workout content.
3. Complete onboarding → assessment → approved plan → workout execution → outcome/debrief → safe reassessment or weekly adjustment.
4. Make every user-facing blocker actionable and keep policy/reviewer blockers separate from missing runner information.
5. Verify the loop on a real device, including offline restart and accessibility behaviour.

### Later: broaden into the product blueprint

- Today dashboard and daily readiness loop.
- Coach conversations, memory, corrections, and narrative progression.
- Race search/setup, race week/day, outcomes, recovery, and continuation plans.
- Progress analytics and trends.
- Supported integrations: calendar, devices, health platforms, treadmill, watch execution, and external activity import.
- Billing/subscriptions, restore purchase, customer support, moderation/review tooling, policy publishing operations, and release analytics.
- Full privacy, security, support, and public-release readiness work.

## Comparison with the Sensei product blueprint

The [Sensei product blueprint](C:/Users/Lenovo/Downloads/sensei-product-blueprint.md) describes a much broader end-to-end coaching product, with 204 numbered feature items across entry, assessment, plans, adaptation, daily coaching, tracking, results, analytics, character, conversation, story, race support, integrations, billing, profile, and operations.

This is a directional planning estimate, not a line-by-line certification:

| Blueprint coverage | Estimated status |
| --- | --- |
| Substantially implemented | Approximately 15–20% |
| Partially implemented, experimental, or research-only | Approximately 20–25% |
| Remaining product/release work | Approximately 60–65% |

Torto has done **more depth than the blueprint requires** in a few areas:

- Auditable beginner-5K evidence and policy provenance.
- Versioned GPS metrics, lifecycle recovery, quality states, splits, and diagnostic exports.
- Research-only plan guards and reviewer/authorization mechanisms.
- Jett/Moss lip-sync and on-device mascot playback experiments.
- Local-model experimentation.

However, this extra depth does not replace the blueprint's major unfinished product areas: complete coaching journeys, professionally reviewed HM/full-marathon content, race support, commercial capabilities, integrations, and physical release validation.

## Release readiness decision

### Suitable now

- Restricted internal engineering testing.
- Outdoor GPS diagnostic data collection using the dedicated internal build.
- Research/preview workflows clearly labelled as non-production.
- Continued automated and device validation of existing tracker and plan flows.

### Not suitable yet

- Public claims of accurate GPS pace/distance across Android devices.
- Unsupervised automatic training adaptation.
- Publicly released beginner 5K, half-marathon, or marathon prescriptions without confirming the applicable policy/content authorization.
- Paid subscription launch.
- Claims of a complete AI coach, supported Strava personalization, or complete device ecosystem integration.

## Recommended next decision

Choose one product promise for the next release cycle:

1. **Trustworthy outdoor running tracker:** finish measured-route validation, diagnostics, History, and reliability first.
2. **Reviewed beginner 5K coach:** finish one explicitly authorized coaching loop after tracker acceptance.
3. **Half-marathon coach:** substantially larger scope; requires reviewed content/policies and many blueprint areas still absent.

The lowest-risk order is **1 → 2 → 3**.

## How to keep this document current

When a milestone changes, update only the relevant section and add:

- the implemented files and tests;
- whether the result is automated, source-level, or physical-device verified;
- any policy/release gate still in force;
- the exact next acceptance condition.

Never promote a capability from “research-only” or “field validation pending” merely because TypeScript or Jest passes.
