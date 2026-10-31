import { demo5kTemplate, demo10kTemplate, demoHalfTemplate } from './demoContent';
import type { PlanTemplate } from './content';

// Synthetic fixtures only: reuse existing workouts and the existing demo
// recovery rule. Historical 0.2.0 plans retain their original content.
const patterns: number[][] = [];
for (let first = 0; first < 7; first += 1) for (let second = 0; second < 7; second += 1) for (let long = 0; long < 7; long += 1) {
  const days = [first, second, long];
  if (new Set(days).size !== 3) continue;
  const ordered = [...days].sort((a, b) => a - b);
  if (ordered.every((day, index) => (ordered[(index + 1) % 3] - day + 7) % 7 > 1)) patterns.push(days);
}
const flexible = (template: PlanTemplate): PlanTemplate => ({ ...template, semanticVersion: '0.3.0-demo', allowedWeeklyPatterns: patterns.map((pattern) => [...pattern]) });
export const flexibleDemoTemplates = [flexible(demo5kTemplate), flexible(demo10kTemplate), flexible(demoHalfTemplate)];
