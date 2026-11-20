# Multi-distance rebuild progress

## Implemented slice: goal-aware onboarding requirements

- First-5K adult/walking/experience declarations are conditional on the 5K goal in the UI and completeness checks.
- Currently training half-marathon runners must supply weekly minutes and explicitly confirm current capacity. Distance is not silently converted to time.
- Returning runners are not required to certify historical facts as current capacity.
- Existing goal choices are retained; no competitor-only goal categories were introduced.
- Regression coverage: `tests/domain/onboardingRequirements.test.ts`.

## Outstanding work (not completed)

- Review the twelve supplied PDFs and linked primary sources for the new policy-authoring work.
- Separate current and historical measurements in the saved evidence contract.
- Replace generic baseline requirements that still exclude zero-running beginners.
- Author, review and test original foundation, return, 10K and marathon candidate rules.
- Integrate immediate phase selection while preserving the eventual race goal.
- Complete shared generation, independent validation and development Plan UI delivery for the required scenarios.
- Complete conditional, progressive onboarding redesign and remote validation alignment.
- Integrate future-week adaptation only where exact policies authorize it.
- Run complete automated and Android acceptance verification.

No new training policy, numerical prescription, release authorization or production-plan write was introduced in this slice. The reported 50-minute half-marathon profile still requires a foundation policy; this onboarding change does not create that policy.
