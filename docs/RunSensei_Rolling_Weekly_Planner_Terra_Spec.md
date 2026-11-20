# RunSensei: Rolling Seven-Day Personalized Running Planner

**Build-ready technical specification and Terra execution prompt**  
**Research date:** 2026-10-31  
**Repository reviewed:** `NMOLE08/RunSensei`, GitHub `main`, indexed snapshot around commit `72c0e5e` (re-audit current checkout before editing).  
**Product rule:** Long-term goal persists for 2–6 months or flexible duration; only **one seven-day plan is generated, previewed, accepted, and active** at a time. No future-week workouts are generated ahead of time.

## 0. Strict interpretation, blockers, and scope

This is a *proposed* architecture, not a claim the work is already implemented. Do not treat synthetic demo workout content as reviewed training advice. Existing `docs/training-policy.md` explicitly prohibits release of unreviewed numerical policies. Exercise prescriptions and numerical caps require independent qualified coaching review before production. Research examples below are not universal injury-prevention thresholds.

**Strava legal gate (critical):** Strava's API Policy effective June 1, 2026, especially §§5.2–5.4 and 6.2, prohibits use of API data (and derivatives) in AI operation, analytics/combining with other customer data, competitive applications, and extended caching. **On-device Qwen inference does not create an exemption.** A production Strava-powered planning path is blocked without Strava's explicit written permission addressing these uses. Implement the *interface and UI state*, not an unauthorized download-to-model pipeline. The working path uses self-reported, independently entered onboarding answers and RunSensei-native run activity. Never create a disguised manual re-entry workflow for bulk Strava API data. Maintain separate provenance and a fail-closed AI input allowlist.

Do not let the new planner interrupt the Android-first local GPS tracker; make planning an opt-in, reversible feature. Preserve guest operation and Supabase Google authentication.

## 1. Verified existing code: reuse rather than rebuild

| File/path | Current state | New action |
|---|---|---|
| `src/app/onboarding/[step].tsx` | Four steps `baseline/goal/availability/review`; currently 5K/10K/half demos | Refactor into 5 stages: goal, current fitness, schedule, preferences, preview. Keep familiar design and route compatibility. |
| `src/domain/onboarding/types.ts` | `OnboardingDraft`: weekly minutes, longest duration, interruptions, goal, 3-day schedule, timezone | Versioned schema with goal mode, performance inputs, four-week weeks, personal preferences, evidence provenance. |
| `src/features/onboarding/useOnboardingDraft.ts`, `src/application/onboardingDrafts.ts`, `src/data/onboardingDraftRepository.ts` | Existing local draft persistence | Migrate drafts without loss and maintain autosave. |
| `src/domain/onboarding/eligibility.ts` | Demo-only, exact three-day patterns, half entry status | Add template/goal-specific eligibility states; preserve health hold and no-reviewed-content. |
| `src/application/activateDemoOnboarding.ts` | Creates full demo sequence | Keep demo-only path for dev; add distinct reviewed rolling-week activation use case. |
| `src/domain/training/engine.ts` | Generates full authored template duration; exact 3 runs/week; static full-plan phases | Introduce `generateWeeklyCandidates` and `validateWeeklyPlan` as separate path. Don't fake a one-week plan by hiding multi-week generated sessions. |
| `src/domain/training/adjustment.ts`, `src/application/applyAdjustment.ts` | Existing reviewable, fingerprinted, immutable revisions | Extend to conversational proposed reasons and future-only revisions. Preserve existing atomic revalidation. |
| `src/domain/training/entities.ts`, `src/data/migrations.ts` | Profiles, goals, availability, plans, immutable revisions, logical sessions, assignments, logs, resolutions, proposals, audit | Add versioned long-term goal state + seven-day windows, provenance, feedback and model metadata without data resets. |
| `src/app/(tabs)/plan.tsx`, `src/app/(tabs)/index.tsx` | Reads stored assignments from active revision | Show current week and historical completed weeks; don't show imaginary future weeks. |
| `src/app/auth.tsx`, `src/services/auth/supabase.ts` | Existing Supabase Google sign-in (and email/password) | Keep working; separate identity from Strava link permission. |
| `package.json` | Expo SDK ~58.0.17, React Native 0.88, Expo Router, SQLite, pnpm, Jest | Check `llama.rn` and current model compatibility; Expo native build is required. |
| `docs/product-contract.md`, `docs/training-policy.md` | Previous restricted half-marathon and demo-only content policy | Update product scope deliberately; preserve production content-review gate. |

## 2. User journeys and data boundaries

### A. RunSensei without Strava (fully functional)
1. Open tracker without compulsory signup. Optionally sign in with Google via Supabase.
2. Choose **Set up coaching**. Show Strava connection as `Coming after provider approval` / disabled or review-gated; never imply imported data is being used for AI.
3. Complete shared 5-step onboarding with self-reported inputs and any independently recorded native runs (with provenance and quality).
4. Build current performance and long-term goal state.
5. Create reviewed template-based candidates, ask local Qwen 2B only to select/explain or ask for missing information (not invent training numerical rules), validate JSON/dates/limits and preview seven-day week.
6. Accept -> persist plan revision and exactly seven calendar dates, with rest days explicit.
7. Log every workout as completed/partial/skipped/different activity; ask short feedback.
8. If changed, Qwen asks a reason, emits a typed proposal, deterministic validator checks; user accepts -> future sessions change, completed records immutable.
9. At end of week, freeze outcomes, compute actual recent workload, update long-term state, and offer **Generate next week**. Do not generate week N+1 twice or overwrite N.

### B. Strava branch (permission gated)
1. Show explainer and current integration status; do not present fake imported metrics.
2. Until Strava authorizes RunSensei's use case: no API ingestion for training analytics, no model input, no permanently saved Strava activities, no automatic fitness baseline derived from Strava. Users may proceed with independent RunSensei runs + normal onboarding.
3. If written permission is obtained: implement Strava OAuth 2.0 with a secure backend, state/CSRF validation, minimal scopes, refresh-token rotation, throttling, revoke/deletion and privacy semantics. Review exact permissions, cache retention, AI use and marketplace restrictions with counsel/Strava; gate every adapter action based on the authorization scope. Do not assume an approval waiver applies to all purposes.
4. Even in an approved future design, user confirms goal, target date, availability, preferences, limits, and recovery; those are not reliably present in activity API.

### C. Identity and guest constraints
- Supabase Google is for *RunSensei account identity*, not a source of Strava permissions.
- Strava isn't a native Supabase social provider. Don't equate `Continue with Strava` and a Supabase account without an explicit mapped identity design.
- Guest activities and accounts must remain isolated; do not leak old account-owned records under guest mode.
- App tracking continues even when model is not downloaded, phone is offline, or plan generation fails.

## 3. Detailed five-stage onboarding specification

Store draft version, edited timestamp, timezone, provenance, confidence, and confirmation status; all dates local `YYYY-MM-DD`. Use semantic fields, not solely UI labels.

### Step 1 — Select running goal
**Required:** `goal.kind` one of `start_running`, `distance_completion`, `improve_speed`, `improve_endurance`, `maintain_fitness`; goal event `5k`, `10k`, `half_marathon`, `marathon`, `other_supported` where relevant; `goal.dateMode` `fixed`/`flexible`; user-selected target race date if fixed; `goal.targetPerformanceSeconds` nullable; `goal.startDate` (today or chosen calendar date); `goal.targetHorizonWeeks` optional for flexible goals; timezone and display units.
**UI examples:** "Run my first 5K", "Finish 10K comfortably", "Improve my 5K time", "Train for a half-marathon", "Build endurance", "Start running". Distinguish `currentPerformance` and `targetPerformance`; aspirational finish time never becomes a training pace.
**Checks:** fixed race date > start date; unsupported goals return `unsupported_goal` with an alternative path; do not silently promise race readiness or compress a 2–6 month goal.

### Step 2 — Establish current fitness (previous FOUR weeks)
**Required or `unknown`:** experience category (`new`,`returning`,`recreational`,`experienced`), how long actively running, running days per week, **four weekly running totals** with week start/end and km (or duration for novice walk/run), longest **repeatable comfortably today** run in last 4–6 weeks (km or minutes), date of that run, comfortable continuous run duration, recent interruption and duration; current pain/illness limitation screening with non-diagnostic branching. 
**Optional:** recent verified 5K/10K/etc race/time-trial (distance, seconds, date, provenance); perceived easy effort, surface/terrain, cross-training, current recovery concerns.
**Source priority:** high quality RunSensei-native runs -> user confirmation; independently supplied user input -> editable; unknown -> ask or choose cautious beginner path. Exclude suspect GPS and do not equate running speed with race-equivalent performance. Do not infer completed workout from scheduled workout. No pace target for beginners without reliable evidence.
**Four-week entry UI:** show four week cards e.g. 12 km, 15 km, 0 km (travel), 13 km rather than just a single weekly total. Ask why near-zero weeks happened; don't mask gaps by averaging as if normal training.

### Step 3 — Configure schedule
`runsPerWeek` 2–6 *where reviewed templates support it* (potential 1 and 7 only when template reviewed); `availableWeekdays` (ISO Monday=1..Sunday=7 or convert carefully from existing 0..6 convention); per-day `maxSessionMinutes` (includes warmup/rest/cooldown); `preferredLongRunDay`, `restDays`, `busyDates`, `preferredRunTime` optional, fixed vs variable weekly availability, track/gym optional.
Validate available weekday count, long-run day membership, realistic session length and spacing. Do not silently create unsupported day frequencies. Use available date exceptions and calendar-aware weekdays; don't confuse JavaScript Sunday=0 and ISO Monday=1.

### Step 4 — Training preferences
`volumePreference` `gradual|steady|progressive` with **steady/conservative default** (not Runna's challenging/progressive default); `difficultyPreference` `comfortable|balanced|challenging` with **comfortable or balanced default** according to baseline; `workoutPreferences` e.g. easy, intervals, hills, tempo, walk-run, treadmill; `crossTrainingDays` and strength sessions; optional caps on longest run and total weekly time; coaching personality. Explain volume means total running amount/progression, difficulty means demanding workouts, not merely a faster target pace. A user preference cannot override reviewed limits. On beginner/return-to-run pathways, hide or disable challenging intensity when unsupported.

### Step 5 — Review assumptions + preview ONLY first week
Show source-tagged current fitness vs target goal, allowed training days, baseline quality, goal horizon, phase, candidate workload (only if based on reviewed policy), seven day tiles, session details with warm-up/main/recovery/cooldown, RPE or effort cue, rest days, warnings/unknowns. Display explicit why (`baseline`, `availability`, `training preference`, `phase`) and labels `demo preview` if no production-reviewed content.
User confirms / edits; all seven dates exactly once; start date follows selected local week convention (first partial week must be explicitly handled: either start at next Monday or seven consecutive days from chosen start; do not mix). Start of training and race dates are not silently changed.

## 4. Canonical state and provenance

```ts
type DataOrigin = 'runsensei_native' | 'user_reported' | 'manual_verified' | 'strava_api' | 'unknown';
type ValueWithProvenance<T> = {
  value: T | null; origin: DataOrigin; observedAt: string | null;
  quality: 'high'|'medium'|'low'|'unknown'; confirmedByUser: boolean;
};
type GoalKind = 'start_running'|'distance_completion'|'improve_speed'|'improve_endurance'|'maintain_fitness';
type TrainingPhase = 'base_build'|'endurance_development'|'race_specific'|'taper'|'recovery'|'reentry';
interface LongTermTrainingState {
  goalId: string; goalKind: GoalKind;
  goalDistanceMeters: number | null;
  startDate: string; targetRaceDate: string | null; targetTimeSeconds: number | null;
  currentPerformance: {distanceMeters:number; timeSeconds:number;date:string;origin:DataOrigin}|null;
  phase: TrainingPhase; nextWeekIndex: number; lastReviewedWeekEndDate: string|null;
  previousAcceptedWeekId: string|null; interruptionDays: number;
  recentLoadSummary: unknown; policyVersion: string; contentCatalogVersion: string;
}
interface TrainingWeek {
  id:string; goalId:string; index:number; startDate:string; endDate:string;
  state:'draft'|'accepted'|'completed'|'needs_review'|'health_hold';
  activeRevisionId:string|null; generationInputHash:string; modelId:string;
  promptVersion:string; policyVersion:string; createdAt:string;
}
```

All model input fields must be built via a **strict allowlist**, not a catch-all object spread. A `strava_api` or `unknown` record must be rejected from AI inputs. Block Strava-derived/aggregated fields even when copied to another table. Clearly separate planned schedule, actual activity and subjective report. Store current active week only as seven calendar-day entries; history retained separately.

## 5. Deterministic training calculations (research-grounded concepts; parameters need expert review)

**Important:** Runna does not disclose its full formulas. The following are proposed RunSensei formulas, **not Runna formulas**. They're engineering structures and example test parameters pending qualified coach review. Observational injury research does **not** establish a universal safe 10% weekly increase (PMIDs 30534459, 34478518, 40623829). A runner's volume, speed, recovery, and single-session spikes all matter. Never turn an illustrative rate into medical certainty.

### 5.1 Recent workload
For week i from most recent 4 complete calendar weeks, let `D_i = sum(accepted native run distances in metres)` and `T_i=sum(active_seconds)`. Paused time excluded. Missing-data weeks ≠ zero unless tracking coverage was adequate or user confirms there were no runs. Keep data completeness and 0-week interruptions visible.

```text
mean4 = (D1+D2+D3+D4)/4                [only if 4 complete weeks]
median4 = median(D1,D2,D3,D4)         [only if trustworthy]
meanRecent2 = (D3+D4)/2              [oldest -> newest ordering]
conservativeReference = min(median4, meanRecent2)  [proposed conservative heuristic]
```

If coverage is incomplete, use a `baseline_uncertain` state and user-confirmed current workload; do not treat missing GPS as zero and do not automatically convert time to distance. A sustained interruption triggers a reentry path rather than applying standard growth to older mileage.

### 5.2 Proposed cap structures (not approved numbers)

```text
W_next <= min(W_reference * (1 + r_week), W_reference + A_week)
L_next <= min(L_recent_repeatable * (1 + r_long), L_recent_repeatable + A_long, L_absolute_cap)
L_next <= s_max * W_next            [only for compatible template/frequency]
```

`W` is weekly running distance, `L` is the long-run running distance. `r_week`, `A_week`, `r_long`, `A_long`, `L_absolute_cap`, and `s_max` MUST be values supplied by a **reviewed, versioned coach-authored policy** based on cohort, current volume, frequency, phase and interruption status. Never hardcode `0.10` as a universal rule. Low-volume novice plans should use time-based walk-run intervals under their own reviewed policy; cap growth with both relative and absolute limits to avoid pathological jumps from tiny baselines. If policies conflict, return `infeasible`/`no_reviewed_content` instead of inventing metrics.

**Illustrative test only:** For four fully documented weeks of 12, 15, 14, 16 km, `mean4 = 14.25 km`, `median4 = 14.5 km`, `meanRecent2 = 15 km`; `conservativeReference = 14.5 km`. *Do not derive next-week target 15.95 km unless `r_week = 0.10` has been reviewed and authorized for this cohort.*

### 5.3 Session maximum and time availability
`totalSessionSeconds = Σ step.durationSeconds` for all duration steps, including warm-up, easy walking, main repetitions, recovery and cooldown. When a workout is distance-based, do not add incompatible units or guess durations; require an authored time budget or an explicit supported conversion based on valid evidence. Check day cap, rest spacing and cumulative weekly load. Resolve any distance/time uncertainty before activation.

### 5.4 Pace calculations and insights
```text
averagePaceSecondsPerKm = activeSeconds / (acceptedDistanceMeters / 1000)
goalPaceSecondsPerKm = targetFinishSeconds / (goalDistanceMeters / 1000)
paceErrorFraction = (actualPaceSecondsPerKm - prescribedPaceSecondsPerKm) / prescribedPaceSecondsPerKm
```

`goalPace` is **for displaying the aspirational target**, not prescribing a current workout pace. Determine training paces from **current verified performance** using a reviewed pace-zone policy, or simply use RPE/talk-test cues when evidence is insufficient. For interval/tempo workouts, compare corresponding valid segments only (not average of whole run including warmup). Compute trends using multiple comparable sessions, quality filters, and stable conditions. One workout should not automatically raise a pace target. Trigger suggestion only if approved evidence thresholds are met, present effect and reasons, require user approval. Never use noisy/stale GPS or non-comparable workouts.

Optional research comparison only: `T2 ≈ T1 * (D2/D1)^1.06` is a common heuristic for race-time extrapolation, but **must not** be used to issue training prescriptions or promise finish times, especially when comparing very different distances or novice runners, without independent validation. Don't embed it into production by default.

### 5.5 Training phases and goal timeline
Given fixed race date: `remainingDays = differenceInCalendarDays(raceDate, nextWeekStart)`; `remainingWeeks = ceil(remainingDays/7)`; flexible goals use a user-selected horizon and reassess without fabricating a race date. Training phase persists across generated weeks: base build → endurance development → race specific → taper → race/recovery (or walk-run progression). **Only phase and constraints for future weeks are tracked; future workouts are not generated**. Taper and deload dates/volumes are content-authored; don't infer arbitrary every-fourth-week or fixed taper lengths as universal prescriptions. If one-week window overlaps race date, respect race day and recovery with reviewed policy.

### 5.6 Workout structure
Each training day references a coach-reviewed workout/template and an explicit step array:

```ts
type WorkoutStep = { kind:'warmup'|'main'|'recovery'|'cooldown'|'walk'; target:{kind:'duration_seconds'|'distance_meters';value:number}; effortCue?:string; repeatGroupId?:string; };
type TrainingDay = { date:string; status:'rest'|'workout'; role:'rest'|'walk_run'|'easy'|'long'|'quality'|'recovery'|'cross_training'; templateId:string|null; steps:WorkoutStep[]; totalDurationSeconds:number|null; totalDistanceMeters:number|null; purpose:string; effortCue:string|null; };
```

Explicit repetition counts + step order; avoid a vague '5K intervals' prescription. Validate that recovery intervals count toward overall time and that all target units are coherent. Never turn a distance target into fabricated minutes or vice versa.

## 6. Qwen3.5 2B on-device role and system prompt

**Architecture:** Data validator / profile builder → reviewed content selector → deterministic policy/candidate generator → **on-device Qwen3.5 2B** for question selection, explanations and constrained candidate choice → JSON-schema parser → independent policy/goal/time/date validator → user preview → atomic SQLite save.

Preferred runtime `llama.rn` + GGUF Q4_K_M, but verify exact Qwen3.5 tokenizer/template/runtime support and Android ABI on the actual app. `llama.rn` >= v0.10 requires React Native New Architecture. Test Android CPU first; don't assume Q4_K_M can run on the library's constrained OpenCL path. Model size and actual RAM usage differ; use download integrity hash, model manager, cancellation, no background inference while GPS tracking risks performance, no bundled secrets/cloud fallback. No claim of production compatibility until device tests pass.

**System instruction to implement as versioned constant:**

```text
You are Run Sensei, an offline running-plan assistant in RunSensei.
Only respond in the declared structured JSON schema. Your possible actions are
ASK_QUESTION, PROPOSE_WEEK, PROPOSE_REVISION, NO_CHANGE, SAFETY_HOLD.

The user's goal can be months away. You may propose only the NEXT ONE seven-day
week, based on app-provided approved workout candidates and phase constraints.
Do not create or describe workouts for weeks beyond that seven-day window.
The long-term goal and prior actual runs are context, not prescriptions.

Use current performance separately from desired/target performance. Never set
training speed from target finish time alone. If fitness input is stale, missing,
contradictory, or unreliable, ASK_QUESTION or recommend the approved conservative
fallback; never invent data.

You are not allowed to invent numerical workouts, increase weekly load, make
medical diagnoses, clear injuries, guarantee finish times, interpret Strava
API data, or edit local data. Only select among supplied approved template IDs,
allowable date slots, and constraints. Rest days count toward the seven days.
A workout includes warm-up, work, recovery and cooldown as specified in the
reviewed template, not just the main run.

When the athlete misses or changes a session, ask one short relevant question
and classify the response without assuming intent. Suggest only permitted
reschedule, skip, rest/reduce, or no-change options; never add catch-up mileage.
For pain, illness or concerning symptoms, use SAFETY_HOLD and defer to the app's
safety/reassessment flow. Never auto-escalate based on one workout.

Completed workout records are immutable. All revisions affect only remaining
future sessions and require app validation and explicit user confirmation.
Explain changes in plain language. If no approved candidate can satisfy the
rules, emit NO_CHANGE or ASK_QUESTION with machine-readable reason.
```

Output schema (model values are proposed, not authoritative):

```json
{
  "action":"PROPOSE_WEEK",
  "weekStart":"2026-11-02",
  "weekEnd":"2026-11-08",
  "candidateTemplateIdsByDate":{
    "2026-11-02":"easy-30-reviewed-v1",
    "2026-11-03":null,
    "2026-11-04":"easy-35-reviewed-v1",
    "2026-11-05":null,
    "2026-11-06":null,
    "2026-11-07":"long-45-reviewed-v1",
    "2026-11-08":null
  },
  "reasonCodes":["GOAL_ENDURANCE","BASELINE_CONFIRMED"],
  "explanation":"This is a candidate illustration only; templates and numbers require reviewed source content.",
  "questions":[]
}
```

The example dates and IDs are *synthetic*; they are not real reviewed workouts. Model outputs should preferably select candidate/template IDs instead of introducing arbitrary durations and paces. Validate all seven dates, no duplicates, every date and assignment, rest days, availability, volume, long run, effort, readiness flags, template approval, metadata and provenance.

## 7. Feedback → adaptive plan changes

### 7A. Pace insights
- For valid goal-pace work, measure planned vs actual *specific comparable segments*; filter GPS quality; compare ≥N recent eligible sessions where N is reviewed config.
- State `insufficient_evidence`, `on_track`, `possibly_too_fast`, `possibly_too_slow`, `variable`; proposed pace change only after stable trend and user accepts.
- Never infer from a single activity, noisy GPS, walking breaks or goal time alone. Keep old target when evidence insufficient.

### 7B. Missed workout dialogue
- Past workout with no result => `unresolved`, **not** `skipped`; ask "Did you complete this workout?" before adapting.
- If truly skipped, Qwen asks reason `busy|fatigue|illness|pain|travel|motivation|equipment|other`, one question at a time; use source-tagged reason and uncertainty.
- Offer `drop`, `reschedule_if_safe`, `reduce_rest`, `reassess_goal`, `no_change`, but only where reviewed policy supports it.
- Check other session spacing, current actuals, available weekday minutes, long-run protection, taper; no doubled sessions or catch-up volume.
- Several misses/full missed week => reassessment and optionally propose future-week reset; do not blindly copy Runna's `>3 missed` threshold as a universal clinical rule. Define reviewed triggers.
- For fixed race date, changing training feasibility may prompt alternative goal rather than forcing load.

### 7C. Reduced readiness / Not feeling 100%
- User can request reduce, pause or recovery check-in. A 3–14-day duration can be offered as product UI inspired by Runna but must be reviewed for RunSensei, not assumed to prove medical clearance.
- Pain/illness => `health_hold` under existing safeguards; do not use AI to diagnose or authorize return. Never pressure users to train through discomfort.
- Returning after prolonged interruption requires new baseline and an approved reentry template; time away does not equal a training debt.

### 7D. Post workout review
Use existing activity logs and `SessionResolution`: completed, partial, acknowledged skip, different activity. Add optional quick feedback: helpful? RPE 1–10, pace felt too difficult/easy, pain yes/no, availability, free-text reason. Store actual independently; allow user to decline adjustments. Never infer negative feedback automatically authorizes a revision.

### Atomic revision protocol
1. Compose `PROPOSE_REVISION` with reason codes and eligible future session identifiers only.
2. Re-evaluate current snapshot and policy with input fingerprint, no stale proposal.
3. Show old/new before/after diff and explanation; explicit accept/reject.
4. Apply through existing `applyValidatedRevision` transaction with idempotency key and parent revision.
5. Preserve completed sessions, all activity history, original revision, and audit event. If stale/conflicting, ask to refresh instead of force-writing.

## 8. Storage, model privacy and migration

- Introduce a `goal_training_state` table or compatible existing records for phase, horizon, progress, last processed week, policy/content versions.
- Add `training_weeks` keyed unique (`goal_id`,`week_index`) and `week_revisions`; retain normalized `session_assignments` and existing immutable `plan_revisions` when possible.
- Add `fitness_observations` with source+quality+confirmation; `workout_feedback`; `sensei_conversation_state` storing minimal typed state rather than full unbounded chat history; `model_installations` for version/hash/state.
- Use additive `src/data/migrations.ts` migrations with smoke migration test from existing v7 database, idempotent reruns, foreign key/unique constraints where supported and transactional saves.
- Prevent concurrent `Generate Week` requests from double-creating a week. If same goal/week already accepted, return it; regenerate only by explicit reviewable revision action.
- Keep guest data isolated and account linking explicit. Assess local encryption of sensitive responses and Android backups; no implicit cloud sync.
- Log only non-sensitive diagnostics (counts, IDs, validation codes), never raw GPS routes, tokens or full health feedback in standard logs.
- Preserve historical synthetic demo records and distinguish them in UI; don't turn old demo data into real training.

## 9. UI requirements and no more than seven dates

Screens: (a) choose start (`Set up coaching`), (b) Strava unavailable/permission status or manual path, (c) five-step onboarding with progress and draft-save, (d) current vs target performance review, (e) local model download/progress/low-storage states, (f) preview seven-day agenda, (g) detail steps warm-up/main/recovery/cooldown, (h) workout completion/feedback, (i) Sensei one-question dialog, (j) revision before/after compare and accept/reject, (k) end-of-week review + `Generate Next Week`.

Use existing RunSensei colors, cards, typography and outdoor-readable controls. Today and tracker remain available without an active coach. Plan screen can display **past recorded weeks**, current week, and a `Next week not generated yet` placeholder, but not future prescriptions. If user is in week 1 of 16, show progress/goal timeline without creating workouts for weeks 2–16.

## 10. Phased implementation with evidence gates

**Phase 0 / audit:** inspect uncommitted changes, exact onboarding routes, existing tracker feature flag, all docs/contracts, training content and current native state. Report file impact and existing tests. No code edits before audit. Update contracts to document new scope and old demo restrictions.

**Phase 1 / new onboarding & migration:** implement five steps, versioned draft conversion, goal vs current performance distinction, four-week history, schedule preferences, safety branches. Test autosave/restart, blank answers, units, weekdays and migratability.

**Phase 2 / profile analytics:** native-only source allowlist, accepted GPS sample metrics, completeness, four-week baseline/longest repeatable, interruption detection. Unit test missing weeks vs zeros, 0 distance, outliers, self-reported vs measured provenance, Strava rejection.

**Phase 3 / reviewed training policy framework:** add separate rolling-week generator, workflow/phase state, versioned content policies, conservative eligibility checks. Keep `no_reviewed_content` until original coach-reviewed policy supplied. Fixture-only candidates can exercise UX in development. Test 2–6-day supported patterns, recovery, long-run independent caps, race date, taper/deload, no time-distance guessing.

**Phase 4 / model feasibility:** verify device ABI/SDK/React Native New Architecture and `llama.rn`+Qwen3.5 2B Q4_K_M load; model download/checksum/cancel/delete, constrained JSON, memory/time/temperature benchmarks; CPU-first actual Android. If not proven, use local deterministic candidate selector and label model unavailable. Native config change requires rebuild.

**Phase 5 / Qwen orchestration:** allowlisted compact input, reviewed candidate IDs, versioned prompts, constrained action schema, reject out-of-catalog IDs, fallback on malformed/timeout/low-memory, fixed bounds on retries. Synthetic fixtures only until policies reviewed.

**Phase 6 / week preview, accept, persistence:** exactly 7 calendar dates; no future plan generation; one active week, immutable past; compare/approve and atomic SQLite commit. Test double taps, process restart, time zones/DST, accidental future generation, stale model result.

**Phase 7 / feedback, pace insights, missed sessions, readiness:** conversational reason capture, evidence-gated pace suggestion, future-only revision preview, explicit decline/approve, pain/illness safety hold. Test missed long run, 4 missed sessions, fatigue, no reason, two sessions on same day, taper week, unlogged vs skipped, unreliable GPS.

**Phase 8 / next-week handoff:** deterministic weekly completion review → freeze facts → update state and phase → request next seven days only. Retain prior weeks, no training debt. Test goal fixed/flexible, 2–6 month continuity, course correction, deload/taper, no duplication.

**Phase 9 / device and release:** run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm run doctor`, Android native build, offline on a real 6GB/8GB Android phone. Record model load latency, output tokens/s, crash/RAM, battery, and longer 30+ synthetic runner scenario evaluation against reviewed coach decisions. Never claim readiness without human coaching review and platform privacy check.

**Status reporting after every phase:** changed files, exact commands/output, passing/failing tests, emulator vs actual Android results, rollout/rollback notes, and whether Metro refresh or native rebuild is required. Preserve working directory uncommitted changes; do not rewrite history or wipe SQLite to fix bugs.

## 11. Acceptance criteria

1. Existing app launches, guest tracking and Supabase Google path are preserved.
2. Same five-stage onboarding for all users; Strava status truthful and gated.
3. Baseline considers four recent weeks, longest *repeatable today*, interruption, source quality.
4. Current performance and target performance stored separately.
5. Only seven dates are generated for the active week; no future prescriptions created or saved.
6. Every prescribed workout step has kind, duration/distance with consistent units, reviewed template ID, purpose and effort; rest days explicit.
7. Actual results are immutable; no automatic catch-up runs.
8. Changes are proposed, validated, previewed and accepted transactionally; stale/duplicate requests fail safely.
9. Qwen runs fully offline once downloaded on at least one actual tested Android device; if model unavailable, local tracker works.
10. Strava API-origin data never enters the Qwen prompt or analytic baseline without documented separate permission and tests.
11. No production plan can activate using demo/unreviewed training policies.
12. One-week handoff keeps the long-term goal and previous weeks, with adjustments for taper/deload/recovery when a reviewed policy requires them.

## 12. Terra execution instructions (copy-paste)

**Role:** You are Terra, a senior Expo React Native/Android and training-systems engineer implementing this specification in the currently checked-out RunSensei codebase.

**Required behavior:** Audit the actual checkout first. Then implement **one phase at a time** from §§10–11, run relevant tests and report exact evidence. Reuse existing onboarding draft storage, SQLite schema and immutable adjustment flow. Do not silently discard the current tracker or authentication. Preserve current working changes. Do not install new native dependencies or regenerate Android until compatibility is demonstrated and explained. Make all branches testable with synthetic fixtures; don't label demo content as real prescriptions.

**High priority decisions:**
- Fixed long-term goal state (2–6 months possible) plus rolling **seven-day generation only**.
- Strava API integration is approval-gated and cannot feed an LLM merely because inference is on-device.
- One shared five-stage onboarding; manual independently-entered baseline when no authorized data source.
- Distinct `currentPerformance` vs `targetPerformance` and a four-week baseline.
- Reviewed deterministic numerical training engine chooses valid candidates; Qwen 2B talks, asks, explains and selects constrained choices; validator retains authority.
- Recovery, rest, long-run caps, deload and taper as reviewed policy; no universal 10% rule.
- Warm-up, work, recoveries and cooldown represented explicitly.
- Feedback drives user-approved future-only immutable revisions with an auditable reason.

**Start now with Phase 0**, report complete audit/roadmap; proceed to Phase 1 and its tests where possible. Stop activating real prescriptions if coach-reviewed policies are absent. Show changed filenames, exact terminal test results, and any blocker after each phase. No status claims based only on source inspection.

## 13. Research and engineering references

- Runna — Current fitness and progression: https://support.runna.com/en/articles/15231838-how-does-runna-build-your-training-plan-around-your-current-fitness
- Runna — Training preferences (volume vs difficulty): https://support.runna.com/en/articles/10393191-how-to-use-training-preferences
- Runna — Mileage, deload, plan length: https://support.runna.com/en/articles/14666572-how-runna-calculates-your-mileage-and-how-to-adjust-it
- Runna — Pace insights: https://support.runna.com/en/articles/14656203-what-are-pace-insights-and-how-do-they-work
- Runna — Missed workout realignment: https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature
- Runna — Reduced readiness: https://support.runna.com/en/articles/13531498-how-to-use-not-feeling-100
- Strava API Policy (effective 2026-06-01): https://www.strava.com/legal/api_policy
- Strava API reference: https://developers.strava.com/docs/reference/
- llama.rn Android/Expo/New Architecture: https://github.com/mybigday/llama.rn
- Systematic review on running load and injury, PMID 30534459: https://pubmed.ncbi.nlm.nih.gov/30534459/
- Review of running injuries and training parameters, PMID 34478518: https://pubmed.ncbi.nlm.nih.gov/34478518/
- Single-session spike cohort study, PMID 40623829: https://pubmed.ncbi.nlm.nih.gov/40623829/
- Endurance taper meta-analysis, PMID 37163550: https://pubmed.ncbi.nlm.nih.gov/37163550/

These references support *design principles*, not permission to copy Runna content nor numerical evidence for a universally safe training progression.
