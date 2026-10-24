import { formatDateOnly, parseDateOnly } from '@/domain/calendar/adapter';
import { displayMinutesToSeconds, displayToMeters, metersToDisplay, secondsToDisplayMinutes } from '@/domain/units';
import { fingerprint } from '@/domain/context';

describe('calendar and unit adapters', () => {
  it('round-trips calendar dates without timezone conversion', () => { expect(formatDateOnly(parseDateOnly('2026-10-24'))).toBe('2026-10-24'); });
  it('round-trips canonical meters and seconds', () => { expect(displayToMeters(metersToDisplay(5000, 'metric'), 'metric')).toBe(5000); expect(displayMinutesToSeconds(secondsToDisplayMinutes(2100))).toBe(2100); });
  it('creates stable fingerprints independent of object key order', () => { expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 })); });
});
