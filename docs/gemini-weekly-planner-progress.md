# Gemini one-week planner implementation status

Updated: 2026-10-30

> **Retired rollback path (2026-10-31):** Gemini execution is permanently disabled in the mobile product while the on-device Qwen migration is validated. Do not deploy this path or configure a Gemini key. See `docs/qwen-on-device-progress.md` for the active implementation.

## Outcome

The server-side foundation for an exactly-one-week Gemini composer is implemented, but it is deliberately disabled in the tracker-first app and cannot activate production coaching content yet. The repository still has no professionally reviewed numerical training policy or reviewed production workout library. Missing review is returned as `no_reviewed_policy`; the server does not invent a fallback.

The mobile app never receives or stores `GEMINI_API_KEY`. It sends only `weekStartDate` and an idempotency key to the authenticated Supabase Edge Function. The function verifies the session, loads the user's questionnaire and trusted native-run summary server-side, loads an active reviewed policy, builds the allowlisted model input, calls Gemini, validates the result, and saves it transactionally.

## Implemented files

- `supabase/functions/_shared/weeklyPlanner.ts`: typed input/output contracts, prompt v1, structured-output schema, source filtering, health gate, exact seven-day semantic validation, and exact template matching.
- `supabase/functions/generate-week/index.ts`: authenticated server-only Gemini 3.8 Flash call using `@google/genai@2.31.0`, medium thinking, JSON response schema, idempotency, safe errors, and no sensitive logging.
- `supabase/migrations/202610300001_weekly_planner.sql`: additive cloud tables, ownership RLS, one-active-week constraint, generation request records, and transactional save RPC.
- `src/services/training/weeklyPlanner.ts`: authenticated mobile caller. It does not accept a model name, prompt, user ID, policy, source tag, or API key from the UI.
- `src/config/productMode.ts`: independent `weeklyAiPlannerEnabled` gate. It remains false in tracker mode and requires `EXPO_PUBLIC_WEEKLY_AI_PLANNER_ENABLED=true` in legacy planner mode.
- `tests/domain/weeklyPlanner.test.ts`: offline contract coverage using clearly synthetic fixtures.

## Deterministic safety boundary

Gemini may arrange reviewed templates and write short explanations. It may not create workout durations, steps, pace targets, intensity, progression, or eligibility rules. Validation rejects:

- anything other than seven unique consecutive dates;
- a changed week start;
- unknown template IDs or any modification to an allowlisted template;
- running on unavailable weekdays or over day/session/weekly limits;
- malformed rest days and segment totals;
- current pain, illness, or a restriction needing review;
- unreviewed policy content;
- Strava API, Strava-derived, unknown, or otherwise disallowed provenance.

Only RunSensei-native summaries are eligible for future AI input. Raw GPS points, names, email, tokens, device IDs, and medical free text are not included.

## Verification evidence

- Weekly planner Jest contract: **23 passed, 0 failed**.
- Repository TypeScript: passed after the implementation.
- Repository lint: passed after excluding only Deno `npm:` resolver false positives on the two pinned Edge imports.
- Expo Doctor: 18/20 checks passed. It reports the pre-existing native-project/app.json synchronization warning and 13 Expo SDK 58 patch-version mismatches. No packages were upgraded as part of this server-only change.
- Live Gemini call: **not run**; no replacement secret was supplied or printed.
- Supabase migration/deployment/RLS integration: **not run against the remote project**.
- Android UI/device: **not changed or tested**; this work is server/domain configuration only.

## Secure setup (not yet executed)

1. Create a new Gemini key if any previous key was pasted into chat or source.
2. Link the Supabase CLI to the intended project.
3. Apply `supabase/migrations/202610300001_weekly_planner.sql` in a controlled environment and test RLS with two accounts.
4. Set the function secret without putting it in Expo variables:

   `supabase secrets set GEMINI_API_KEY=YOUR_NEW_KEY`

5. Deploy the function:

   `supabase functions deploy generate-week`

6. Store a questionnaire for a test account and a **synthetic/demo** policy only in a non-production environment. Do not insert a fake row with status `reviewed`.
7. Run an authenticated synthetic end-to-end request, verify one saved week and retry idempotency, then inspect that no route coordinates or identity fields entered logs or plan metadata.

## Remaining dependencies

- A reviewed policy and reviewed workout templates must be authored and approved before production activation.
- A trusted sync/summary path from local RunSensei activities to `weekly_native_run_summaries` is not implemented; local tracker operation remains independent and offline.
- The common weekly-planner onboarding/profile sync and seven-day review UI are not wired to this function.
- Cloud deletion/export for these new tables needs to be integrated before release.
- Remote migration, Edge bundling, rate-limit behavior, real Gemini structured output, RLS isolation, emulator, and physical-device behavior remain unverified.

The supplied standalone prototype was used as reference material only. Its synthetic numbers are not installed as production training content.
