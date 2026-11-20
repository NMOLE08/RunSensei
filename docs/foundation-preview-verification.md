# Foundation preview vertical slice

The experimental half-marathon adapter now accepts a separately confirmed current foundation baseline. This confirmation covers current weekly running, current comfortable continuous running, and comfortable walking; it does not reclassify the dated longest session as current. Existing answers and historical policies are preserved. Editing running facts clears confirmation. The assessment fingerprint includes confirmation but excludes technical updatedAt metadata. Older assessments require one new review.

Flow: saved account draft and assessment → fingerprint check → explicit foundation confirmation → common planning constraints → `generateFoundationWeek` → existing generic scheduler → `validateFoundationWeek` → `ExperimentalHalfMarathonPreviewCard`.

Selecting the foundation confirmation explicitly chooses a foundation preview. Full half-marathon preparation still uses the existing separate all-capacity confirmation when no foundation confirmation is present. No automatic transition or next-week escalation is implemented.

## Reproducible synthetic result

See `artifacts/foundation/week-1-50-minutes.json`. Inputs: 50 current weekly running minutes, 45 current comfortable minutes, historical longest 75 minutes (excluded from calculation), no interruption or health concern, Monday/Tuesday/Thursday/Sunday availability with confirmed 30-minute limits. Requested week starts Monday January 4, 2027. The scheduler selects Tuesday January 5, Thursday January 7, Sunday January 10. Each workout is 300 seconds walking warm-up + 1,000 seconds easy running + 300 seconds walking cooldown. Total: 3,000 running seconds + 1,800 walking seconds = 4,800 scheduled seconds. Technical validation passes. This is not coaching approval.

All numerical values are original draft candidates; no source establishes individual safety. Three sessions and added walking load need qualified review. First-time and returning runners remain explicit unsupported policy states. Two-day availability never becomes three-day availability. No further progression, event readiness, or fixed race-date guarantee is implied.

## Android retest

1. Start the existing development build with `EXPO_PUBLIC_EXPERIMENTAL_5K_PREVIEW=true`. A Metro reload is sufficient; no native dependency was added.
2. From Plan, choose **Review current foundation evidence**. The app opens the saved Goal step with Half marathon retained. Keep the historical longest duration and its actual date unchanged. Select the current foundation evidence confirmation only if the saved weekly/comfortable running values describe what can be repeated now and comfortable walking is truthful.
3. Save the change, review the starting point once, and return to Plan. Existing assessments created before this field was introduced legitimately require this one review; unchanged evidence must remain current on later Plan visits and app restarts.
4. For a matching 50-minute synthetic profile, verify three 26m40s sessions, 50 running + 30 walking = 80 total minutes. Verify actual selected dates and the experimental warning. Your real data may produce a different result or a truthful block.
5. Reduce all daily limits below 26m40s or select only two days: preview must block, without changing saved availability. Reported health concerns must block. Signing into another account must reload its own saved facts.

Physical Android verification covered secure session restoration, the account-owned Plan blocked state, the focused foundation-evidence edit route, saved half-marathon goal retention, and app restart. The current account still requires the runner's truthful foundation-evidence confirmation, so the successful foundation card remains a manual verification step for that account. Physical account switching was not performed. Preview generation only reads account data; it does not create plans, assignments, activities, notifications or remote workouts. Existing development/opt-in access remains required.

Assessment lookup now prefers the immutable owner-scoped result matching the current canonical evidence fingerprint. Timestamp ordering is retained only as the stale fallback when no exact result exists. This prevents a historical or legacy assessment from causing repeated review loops after unchanged evidence has already been assessed.

## Remaining rebuild

Beginner and returning numerical foundation variants, multiweek foundation progression, executable 10K/marathon candidate policies, adaptation authorization, and qualified review remain unfinished. This slice is only a currently-training foundation week. The wider rebuild is not complete.
