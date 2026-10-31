# Running product and content research

Accessed 2026-10-26. These notes summarize public documentation, not proprietary algorithms. Any behavior not described below is unknown, not evidence that a product lacks it. Numerical examples belong to the cited products or documents and are not RunSensei policy.

## Competitor behavior

| Product | Publicly documented inputs and behavior | Gaps and limits |
| --- | --- | --- |
| Runna | Goal and running ability affect a plan; changing ability rebuilds session lengths and weekly mileage. Its realignment flow offers skip or rearrange for missed sessions, and extension, rebuild or restart options for longer gaps, depending on plan type and date. | The exact algorithm and full feedback weighting are undisclosed. Free access includes week one and activity recording; later planned workouts require subscription. Sources: [ability](https://support.runna.com/en/articles/6205993-adjusting-your-running-ability), [realignment](https://support.runna.com/en/articles/10026375-how-to-use-the-plan-realignment-feature), [subscription](https://support.runna.com/en/articles/8112247-managing-your-runna-subscription). |
| Trenara | Describes recent completed training, fitness classification, perceived effort and pause reasons as inputs to plan adjustment; after a pause it reassesses the goal. Peak lets users choose training days and reschedule or remove current-week sessions. | The adjustment article explicitly limits its description to Peak Pro ultimate plans. Free/Peak tier details are on [pricing](https://www.trenara.com/nl/pricing); numerical decision rules are not disclosed. Sources: [adjustment](https://www.trenara.com/blog/the-why-was-my-plan-adjusted-blog), [schedule](https://www.trenara.com/features/select-and-switch-running-days). |
| TrainAsONE | An official coach-authored FAQ discusses short runs in beginning or returning to training. Its [static plan explainer](https://www.trainasone.com/wp-content/uploads/2022/10/Stock-Training-Plans-Infographic-v3.pdf) distinguishes static plans from individualized ones. | The main site returned access errors during this audit; detailed profile inputs, activity weighting, missed/interrupted-session handling, scheduling and current subscription limits remain unverified. Do not infer them. [FAQ](https://trainasone.com/ufaq/are-short-runs-e-g-less-than-20-minutes-beneficial/). |
| Garmin Coach | Setup asks for average weekly distance and pace, goal, available days, and potentially frequency and long-run day. Expert plans adjust workouts from benchmark and performance; missed/skipped sessions cause future adjustment and repeated skips may prompt pause. Expert plans allow prospective rescheduling; Garmin Run Coach instead adapts automatically. | Behavior differs by plan and device. Expert running plans are described as free and require compatible devices for adaptive use. Garmin documents subjective self-evaluation separately; do not assume it contributes to metrics. [Plan options](https://support.garmin.com/en-US/?faq=IkvWNeIoSd48GIYCjkhlo7&productID=707538&tab=topics), [self-evaluation](https://support.garmin.com/lt-LT/?faq=8nISJXqSZVAI3Td4IWRqsA). |

## Training sources and rights

- [B.A.A. half-marathon](https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/): Level One is aimed at a first half marathon; the published schedule uses four running days, off days, a long run and phases leading to the race. Higher levels introduce more quality work. It is a guide, not a personalized assessment; entry, interruption and adaptation rules are not a complete application policy. The [Level One PDF](https://www.baa.org/wp-content/uploads/docs/2018-07/2018_BAA_HalfMarathon_Training_Level1.pdf) states reproduction/rebroadcast requires permission. Do not copy its plan into the app.
- [NYRR conservative half-marathon](https://webassets.nyrr.org/nyrrsitecoreblob/nyrr/pdf/training-guides/hm-training-plan_conservative-rd1.pdf): ten weeks, for an established runner averaging three to four days weekly with a recent longest run around 40 minutes. Its table includes regular, speed, long and cross-training days and rest, with changing durations. Individual adaptations and return-from-injury rules are not specified. [NYRR terms](https://www.nyrr.org/terms-of-use) restrict reuse; permission or separately authored content is needed.
- [B.A.A. marathon](https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/): Level One targets an established running volume and approximately four running days, with preparatory, building, marathon-specific and taper phases. It is not a general novice-entry rule. Rights and application-specific prerequisites, adaptation and review remain unresolved.

## Coverage matrix

| Candidate family | Evidence gathered | Runnable content / gap |
| --- | --- | --- |
| Beginner run/walk foundation | TrainAsONE discusses starting/returning; Runna describes a separate beginner family. | No approved original plan or entry and return policy. Unsupported. |
| Building consistent running | Sources discuss existing running experience and scheduling. | No reviewed baseline or progression policy. Unsupported. |
| First 5K | Runna lists beginner and distance plans. | Synthetic five-week fixture only; no reviewed content. |
| First 10K | Garmin and Runna list 10K goals. | Synthetic seven-week fixture only; no reviewed content. |
| First half marathon | B.A.A. and NYRR have structured published plans for distinct starting baselines. | Synthetic 16-week fixture only; original licensed content and qualified review are needed for a complete production pathway. |
| Half-marathon improvement | B.A.A. higher levels include quality training. | No original reviewed prerequisite, effort or progression policy. Unsupported. |
| First marathon | B.A.A. describes an established-volume starting point. | No supported application prerequisites or reviewed policy. Unsupported. |

No source above has been represented as approving RunSensei's fixture numbers. License status is based on the cited public notices, not legal advice or a grant of reuse permission.

## Source coverage details (rechecked 2026-10-26)

| Family / source | Intended runner and goal | Frequency and length | Rights and integration status |
| --- | --- | --- | --- |
| [B.A.A. first half](https://www.baa.org/races/boston-half/info-for-athletes/boston-half-training/) | First half marathon; runner must choose a plan matching experience. | Four running days in the Level One schedule; plan length appears in the published schedule. | B.A.A. explicitly prohibits reproduction or repurposing without written consent. No app content copied. |
| [NYRR conservative half](https://webassets.nyrr.org/nyrrsitecoreblob/nyrr/pdf/training-guides/hm-training-plan_conservative-rd1.pdf) | Half-marathon runner already averaging 3–4 days/week and a longest run around 40 minutes. | Ten weeks, four run days plus cross-training. | Reuse permission unconfirmed; research reference only. |
| [B.A.A. marathon](https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/) | Marathon, Level One assumes established running volume. | Approximately four running days; 20-week schedule. | B.A.A. explicitly requires written permission to reproduce or repurpose. No app content copied. |
| Existing synthetic 5K / 10K / half | Development testing, not a runner prerequisite or coaching recommendation. | 3 days per week; 5 / 7 / 16 weeks respectively. | Original synthetic fixtures; demo only, no professional review. |
| Other requested families | Prerequisites, duration and frequency are not sufficiently supported by approved original content. | Unsupported. | No research draft is represented as runnable or production eligible. |
