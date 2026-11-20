import { dateAfterPickerEvent, dateFromDateOnly, formatLocalDateOnly, isDateOnly } from '@/features/onboarding/dateOnly';

describe('onboarding date-only picker behavior', () => {
  it('formats a selected local calendar date without a UTC date shift', () => {
    const selected = new Date(2026, 10, 9, 0, 5, 0);
    expect(formatLocalDateOnly(selected)).toBe('2026-11-09');
    expect(dateAfterPickerEvent('', 'set', selected)).toBe('2026-11-09');
  });

  it('preserves the stored date when the native picker is cancelled', () => {
    expect(dateAfterPickerEvent('2026-11-09', 'dismissed')).toBe('2026-11-09');
    expect(dateAfterPickerEvent('2026-11-09', undefined, new Date(2026, 10, 10))).toBe('2026-11-09');
  });

  it('uses date-only values when reopening the picker and does not coerce invalid strings', () => {
    const parsed = dateFromDateOnly('2026-02-03');
    expect([parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()]).toEqual([2026, 2, 3]);
    expect(isDateOnly('2026-02-03')).toBe(true);
    expect(isDateOnly('2026-2-3')).toBe(false);
  });
});
