import Constants from 'expo-constants';

export type Experimental5kPreviewEnvironment = { isDevelopment: boolean; previewFlag: string | undefined; internalResearchBuild?: boolean };

/**
 * Draft programmes must be deliberately enabled in a development build. An
 * Expo public variable alone is insufficient because it is compiled into a
 * release build, so this guard always requires __DEV__ too.
 */
export function isExperimental5kPreviewEnabled(environment: Experimental5kPreviewEnvironment): boolean {
  return (environment.isDevelopment || environment.internalResearchBuild === true) && environment.previewFlag === 'true';
}

export const experimental5kPreviewEnabled = isExperimental5kPreviewEnabled({
  isDevelopment: __DEV__,
  previewFlag: process.env.EXPO_PUBLIC_EXPERIMENTAL_5K_PREVIEW,
  internalResearchBuild: Constants.expoConfig?.extra?.internalResearchBuild === true,
});

export function experimental5kPreviewReason(environment: Experimental5kPreviewEnvironment): string {
  if (!environment.isDevelopment && !environment.internalResearchBuild) return 'Experimental plan previews are unavailable in production builds.';
  if (environment.previewFlag !== 'true') return 'Set EXPO_PUBLIC_EXPERIMENTAL_5K_PREVIEW=true in a development build to enable this research preview.';
  return 'Experimental 5K preview enabled for this development session.';
}
