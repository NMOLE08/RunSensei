/** Immediate post-workout feedback; later recovery is a separate observation. */
export interface WorkoutFeedback { version: 1; exertion: number | null; comparison: 'easier' | 'expected' | 'harder' | null; }

export function encodeWorkoutFeedback(value: WorkoutFeedback): string | null {
  if (value.exertion !== null && (!Number.isInteger(value.exertion) || value.exertion < 1 || value.exertion > 10)) throw new Error('Exertion must be a whole number from 1 to 10.');
  return value.exertion === null && value.comparison === null ? null : JSON.stringify(value);
}

/** Older free-text feedback remains readable history, but cannot be treated as a structured answer. */
export function decodeWorkoutFeedback(value: string | null): WorkoutFeedback | null {
  if (!value) return null;
  try { const parsed = JSON.parse(value) as WorkoutFeedback; if (parsed.version !== 1 || (parsed.exertion !== null && (!Number.isInteger(parsed.exertion) || parsed.exertion < 1 || parsed.exertion > 10)) || ![null, 'easier', 'expected', 'harder'].includes(parsed.comparison)) return null; return parsed; } catch { return null; }
}

export function displayWorkoutFeedback(value: string | null): string | null {
  const feedback = decodeWorkoutFeedback(value); if (!feedback) return value;
  const comparison = feedback.comparison === 'easier' ? 'Easier than expected' : feedback.comparison === 'expected' ? 'As expected' : feedback.comparison === 'harder' ? 'Harder than expected' : null;
  return [feedback.exertion === null ? null : `${feedback.exertion}/10 effort`, comparison].filter(Boolean).join(' · ') || null;
}
