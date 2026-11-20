import policy from '../../../PolicyPack/15_beginner_5k_calendar_availability_v0.5.0_draft.json';

export const beginner5kCalendarAvailability = Object.freeze(policy);
export type Beginner5kAvailabilityReference = { policyId: string; version: string };
export function usesCalendarAvailability(reference?: Beginner5kAvailabilityReference): boolean {
  return reference?.policyId === policy.policyId && reference.version === policy.version;
}
