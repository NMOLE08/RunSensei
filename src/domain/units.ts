import type { UnitSystem } from './training/entities';

const METERS_PER_MILE = 1609.344;
export function metersToDisplay(meters: number, units: UnitSystem): number { return units === 'metric' ? meters / 1000 : meters / METERS_PER_MILE; }
export function displayToMeters(value: number, units: UnitSystem): number { return Math.round(units === 'metric' ? value * 1000 : value * METERS_PER_MILE); }
export function secondsToDisplayMinutes(seconds: number): number { return seconds / 60; }
export function displayMinutesToSeconds(minutes: number): number { return Math.round(minutes * 60); }
