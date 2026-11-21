/** Synchronous guard for repeated presses before React can publish saving state. */
export function acquirePathwaySave(guard: { current: boolean }): boolean {
  if (guard.current) return false;
  guard.current = true;
  return true;
}

export function releasePathwaySave(guard: { current: boolean }): void {
  guard.current = false;
}
