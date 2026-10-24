export type DateOnly = `${number}-${number}-${number}`;

/** Returns true only for an ISO calendar day, without applying a timezone conversion. */
export function isDateOnly(value: string): value is DateOnly {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [year, month, day] = match.slice(1).map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}
