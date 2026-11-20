import Constants from 'expo-constants';

export type InternalGpsDiagnosticEnvironment = {
  internalBuild: boolean;
  publicOptIn: string | undefined;
};

/**
 * The diagnostic controls need a release-bundle-safe gate for field evidence,
 * without enabling the broader developer Training Lab in release APKs.
 */
export function isInternalGpsDiagnosticsEnabled(environment: InternalGpsDiagnosticEnvironment): boolean {
  return environment.internalBuild && environment.publicOptIn === 'true';
}

export const internalGpsDiagnosticsEnabled = isInternalGpsDiagnosticsEnabled({
  internalBuild: Constants.expoConfig?.extra?.internalGpsDiagnosticBuild === true,
  publicOptIn: process.env.EXPO_PUBLIC_INTERNAL_GPS_DIAGNOSTICS,
});
