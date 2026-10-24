import { isDateOnly } from '@/domain/calendar/dateOnly';

describe('isDateOnly', () => {
  it('accepts a valid ISO calendar date without interpreting a timezone', () => {
    expect(isDateOnly('2026-10-22')).toBe(true);
  });

  it('rejects impossible and non-date-only values', () => {
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2026-10-22T00:00:00Z')).toBe(false);
  });
});
