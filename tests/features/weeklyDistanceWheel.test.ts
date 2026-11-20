import { formatWheelDistanceKm, WEEKLY_DISTANCE_WHEEL_MAX_KM, WEEKLY_DISTANCE_WHEEL_STEP_KM, WEEKLY_DISTANCE_WHEEL_VALUES_KM, wheelIndexForWeeklyDistance } from '@/features/onboarding/distanceWheel';

describe('weekly distance wheel model', () => {
  it('offers the approved 0–100 km range in 0.5 km increments', () => {
    expect(WEEKLY_DISTANCE_WHEEL_STEP_KM).toBe(0.5);
    expect(WEEKLY_DISTANCE_WHEEL_VALUES_KM[0]).toBe(0);
    expect(WEEKLY_DISTANCE_WHEEL_VALUES_KM.at(-1)).toBe(WEEKLY_DISTANCE_WHEEL_MAX_KM);
    expect(WEEKLY_DISTANCE_WHEEL_VALUES_KM).toHaveLength(201);
  });

  it('writes a numeric string with the same form semantics as the existing field', () => {
    expect(formatWheelDistanceKm(10)).toBe('10');
    expect(formatWheelDistanceKm(10.5)).toBe('10.5');
    expect(wheelIndexForWeeklyDistance('10.5')).toBe(21);
  });

  it('does not reinterpret empty, manually precise, or out-of-range values', () => {
    expect(wheelIndexForWeeklyDistance('')).toBeNull();
    expect(wheelIndexForWeeklyDistance('10.25')).toBeNull();
    expect(wheelIndexForWeeklyDistance('101')).toBeNull();
    expect(wheelIndexForWeeklyDistance('-1')).toBeNull();
  });
});
