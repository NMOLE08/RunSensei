export type ProductMode = 'tracker' | 'legacy-planner';

/**
 * Tracker is deliberately the safe default. The legacy planner remains
 * restorable for development without being initialized in tracker builds.
 */
export const productMode: ProductMode = process.env.EXPO_PUBLIC_PRODUCT_MODE === 'legacy-planner'
  ? 'legacy-planner'
  : 'tracker';

export const trackerOnly = productMode === 'tracker';

/** Independent integration gates. Activity viewing and personalization remain off. */
export const stravaEnabled = process.env.EXPO_PUBLIC_STRAVA_ENABLED === 'true';
export const stravaMockEnabled = __DEV__ && process.env.EXPO_PUBLIC_STRAVA_MOCK === 'true';
export const stravaActivityViewerEnabled = false;
export const stravaPersonalizationEnabled = false;

/**
 * The weekly AI composer is intentionally opt-in and unavailable in the
 * tracker-first product mode. Its API key lives only in a Supabase function.
 */
/** Cloud Gemini planning is retired. The code remains temporarily as rollback evidence. */
export const weeklyAiPlannerEnabled = false;

/** On-device AI is optional at runtime and can be disabled without affecting tracking. */
export const localAiEnabled = process.env.EXPO_PUBLIC_LOCAL_AI_ENABLED !== 'false';
