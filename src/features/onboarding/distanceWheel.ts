export const WEEKLY_DISTANCE_WHEEL_STEP_KM = 0.5;
export const WEEKLY_DISTANCE_WHEEL_MAX_KM = 100;
export const WEEKLY_DISTANCE_WHEEL_VALUES_KM = Array.from(
  { length: WEEKLY_DISTANCE_WHEEL_MAX_KM / WEEKLY_DISTANCE_WHEEL_STEP_KM + 1 },
  (_, index) => index * WEEKLY_DISTANCE_WHEEL_STEP_KM,
);

export function formatWheelDistanceKm(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Returns null for empty, manually precise, or out-of-wheel-range values. */
export function wheelIndexForWeeklyDistance(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > WEEKLY_DISTANCE_WHEEL_MAX_KM) return null;
  const steps = parsed / WEEKLY_DISTANCE_WHEEL_STEP_KM;
  if (Math.abs(steps - Math.round(steps)) > 0.000001) return null;
  return Math.round(steps);
}
