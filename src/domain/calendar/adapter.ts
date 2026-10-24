import { isDateOnly, type DateOnly } from './dateOnly';

/** Calendar-only adapter. It never converts a date-only value through UTC midnight. */
export function parseDateOnly(value: string): DateOnly {
  if (!isDateOnly(value)) throw new Error(`Invalid calendar date: ${value}`);
  return value;
}

export function formatDateOnly(value: DateOnly): string { return value; }
