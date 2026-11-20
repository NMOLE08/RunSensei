export type TrainingLabEnvironment = { isDevelopment: boolean; trainingLabFlag: string | undefined };

/**
 * This is intentionally stricter than an Expo public variable alone. Public
 * variables are embedded in builds, so a release build can never enable this
 * screen even if a flag was supplied accidentally.
 */
export function isDeveloperTrainingLabEnabled(environment: TrainingLabEnvironment): boolean {
  return environment.isDevelopment && environment.trainingLabFlag === 'true';
}

export function developerTrainingLabReason(environment: TrainingLabEnvironment): string {
  if (!environment.isDevelopment) return 'The Training Lab is unavailable in production builds.';
  if (environment.trainingLabFlag !== 'true') return 'Set EXPO_PUBLIC_TRAINING_LAB=true to enable the Training Lab in development.';
  return 'Training Lab enabled for this development session.';
}

export const developerTrainingLabEnabled = isDeveloperTrainingLabEnabled({
  isDevelopment: __DEV__,
  trainingLabFlag: process.env.EXPO_PUBLIC_TRAINING_LAB,
});
