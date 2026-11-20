/** Reviewed build-time trust anchors only. Never read from onboarding, flags or responses. */
export const policyAuthorizationConfig: Readonly<{
  endpoint: string | null;
  roots: readonly { id: string; version: number; spkiHex: string; revoked: boolean }[];
}> = Object.freeze({ endpoint: null, roots: Object.freeze([]) });

// Security freshness tolerances; not coaching/workload parameters.
export const authorizationClockSkewMs = 5 * 60 * 1000;
export const authorizationRequestTimeoutMs = 15000;
