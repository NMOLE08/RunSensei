import type { Id, UtcInstant } from './training/entities';

export interface Clock { now(): UtcInstant; }
export interface IdGenerator { next(): Id; }
export interface DomainContext { clock: Clock; ids: IdGenerator; }

export function fingerprint(input: unknown): string {
  const canonical = JSON.stringify(sortValue(input));
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}
