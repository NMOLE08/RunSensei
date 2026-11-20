/** Date-only helpers deliberately use local calendar parts, never UTC conversion. */
export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dateFromDateOnly(value: string, fallback = new Date()): Date {
  if (!isDateOnly(value)) return fallback;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function formatLocalDateOnly(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

/** Android sends `dismissed`; preserving the former value makes cancellation a no-op. */
export function dateAfterPickerEvent(current: string, eventType: string | undefined, selected?: Date): string {
  if (eventType !== 'set' || !selected) return current;
  return formatLocalDateOnly(selected);
}
