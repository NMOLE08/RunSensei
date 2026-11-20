# System D known issue: workload-history time windows

The v0.4 draft compatibility evaluator currently labels a longest recent session greater than weekly running minutes as `conflicting_evidence` without first proving both observations represent the same time window.

That may be incorrect: a longest session from an earlier 28-day observation window can be larger than a more recent seven-day weekly total without contradiction. System D adds `compareSameWindowObservations`, which returns `incompatible_time_windows` when start/end windows differ or are unknown.

This document intentionally does not change v0.4 or its approved task scope. A future immutable compatibility-policy version must state which windows are comparable and how to handle overlap.
