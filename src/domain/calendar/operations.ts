import type { DateOnly } from './dateOnly';
import { parseDateOnly } from './adapter';

/** Advances a calendar date with calendar setters, never by adding milliseconds. */
export function addCalendarDays(date: DateOnly, days: number): DateOnly { const [year, month, day] = date.split('-').map(Number); const calendar = new Date(Date.UTC(year, month - 1, day)); calendar.setUTCDate(calendar.getUTCDate() + days); return `${calendar.getUTCFullYear()}-${String(calendar.getUTCMonth() + 1).padStart(2, '0')}-${String(calendar.getUTCDate()).padStart(2, '0')}` as DateOnly; }
export function weekday(date: DateOnly): number { const [year, month, day] = date.split('-').map(Number); return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0 ? 6 : new Date(Date.UTC(year, month - 1, day)).getUTCDay() - 1; }
export function nextWeekday(date: DateOnly, target: number): DateOnly { const offset = (target - weekday(date) + 7) % 7; return addCalendarDays(date, offset); }
export function requireDateOnly(value: string): DateOnly { return parseDateOnly(value); }
