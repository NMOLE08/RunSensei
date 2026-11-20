import type { AuthoredPrescription, AuthoredStep } from '@/domain/training/prescription';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import type { UnitSystem } from '@/domain/training/entities';
import { formatTarget } from '@/domain/training/prescription';
import { metersToDisplay } from '@/domain/units';

export type WorkoutAccent = 'moss' | 'coral' | 'butter' | 'lavender' | 'event';
export type WorkoutPresentation = Readonly<{
  title: string;
  category: string;
  accent: WorkoutAccent;
  summary: string;
  target: string | null;
}>;

export type WorkoutStepIndicator = 'RUN' | 'WALK' | 'REST' | 'EVENT' | 'STEP';
export type WorkoutTimelineRow = Readonly<{
  id: string;
  primary: string;
  secondary: string | null;
  indicator: WorkoutStepIndicator;
}>;
export type WorkoutTimelineSection = Readonly<{
  id: string;
  title: string;
  detail: string | null;
  rows: readonly WorkoutTimelineRow[];
}>;

const stepDuration = (step: AuthoredStep, units: UnitSystem) => step.durationSeconds !== undefined
  ? formatSeconds(step.durationSeconds)
  : step.distanceMeters !== undefined
    ? `${metersToDisplay(step.distanceMeters, units).toFixed(units === 'metric' ? 1 : 2)} ${units === 'metric' ? 'km' : 'mi'}`
    : null;

export function presentAuthoredWorkout(prescription: AuthoredPrescription, role: string, units: UnitSystem): WorkoutPresentation {
  const normalized = `${role} ${prescription.purpose}`.toLowerCase();
  const steps = prescription.steps;
  const mainSteps = steps.filter((step) => !/warm.?up|cool.?down/i.test(step.label));
  const hasWalk = mainSteps.some((step) => /walk|recover|rest/i.test(step.label) || /walk|recover|rest/i.test(step.instruction));
  const hasRun = mainSteps.some((step) => /run|work/i.test(step.label) || /run|work/i.test(step.instruction));
  const isLong = /long|extended|endurance/.test(normalized);
  const isEvent = /event|race|completion/.test(normalized) || prescription.target.distanceMeters === 5000;
  const category = isEvent ? 'Completion event' : hasRun && hasWalk ? 'Run / walk' : isLong ? 'Longer easy run' : /recovery/.test(normalized) ? 'Recovery run' : 'Easy running';
  const title = isEvent ? '5K completion event' : hasRun && hasWalk ? 'Run / walk intervals' : isLong ? 'Longer easy run' : 'Easy run';
  const accent: WorkoutAccent = isEvent ? 'event' : hasRun && hasWalk ? 'coral' : isLong ? 'moss' : /recovery/.test(normalized) ? 'butter' : 'lavender';
  const parts = steps.map((step) => stepDuration(step, units)).filter((part): part is string => Boolean(part));
  return { title, category, accent, summary: parts.length ? parts.join(' · ') : prescription.purpose, target: formatTarget(prescription, units) };
}

export function presentPreviewWorkout(session: First5kDraftSession): WorkoutPresentation {
  const event = session.distanceMeters === 5000;
  const run = session.steps.find((step) => step.kind === 'run');
  const walk = session.steps.find((step) => step.kind === 'walk');
  const isRunWalk = Boolean(run && walk);
  const isLonger = session.code === 'C';
  const running = run ? `${formatSeconds(run.seconds ?? 0)} run${run.repeats > 1 ? ` × ${run.repeats}` : ''}` : null;
  const recovery = walk ? `${formatSeconds(walk.seconds ?? 0)} walk${walk.repeats > 1 ? ` × ${walk.repeats}` : ''}` : null;
  return {
    title: event ? '5K completion event' : isRunWalk && isLonger ? 'Longer run / walk' : isRunWalk ? 'Run / walk intervals' : 'Easy run',
    category: event ? 'Completion event' : isRunWalk ? 'Run / walk' : 'Easy running',
    accent: event ? 'event' : isRunWalk ? 'coral' : isLonger ? 'moss' : 'lavender',
    summary: event ? '5K · time is not prescribed' : [running, recovery].filter(Boolean).join(' · '),
    target: event ? '5K' : session.durationSeconds === null ? null : formatSeconds(session.durationSeconds),
  };
}

export function formatSeconds(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return minutes ? `${minutes} min${remainder ? ` ${remainder} sec` : ''}` : `${remainder} sec`;
}

export function displayStepName(step: AuthoredStep) {
  const value = step.label.trim();
  if (/warm.?up/i.test(value)) return 'Warm-up';
  if (/cool.?down/i.test(value)) return 'Cool-down';
  if (/walk|recover|rest/i.test(value)) return 'Walking recovery';
  if (/run|work/i.test(value)) return 'Running';
  return value || 'Workout step';
}

export function previewStepName(kind: First5kDraftSession['steps'][number]['kind']) {
  return ({ warmup: 'Warm-up walk', run: 'Run', walk: 'Walking recovery', cooldown: 'Cool-down walk', event: '5K completion event' })[kind];
}

/**
 * Translates persisted steps into display-only hierarchy. It preserves their
 * ordering and text; it never derives pace, duration, repetitions, or effort.
 */
export function presentAuthoredTimeline(steps: readonly AuthoredStep[], units: UnitSystem): readonly WorkoutTimelineSection[] {
  const sections: Array<{ id: string; title: string; detail: string | null; rows: WorkoutTimelineRow[] }> = [];
  for (const [index, step] of steps.entries()) {
    const section = authoredSection(step);
    let destination = sections[sections.length - 1];
    if (!destination || destination.id !== section.id) {
      destination = { ...section, rows: [] };
      sections.push(destination);
    }
    const label = displayStepName(step);
    const target = stepDuration(step, units);
    destination.rows.push({
      id: `${index}-${step.label}`,
      primary: target ? `${target} · ${label}` : label,
      secondary: step.instruction.trim() || null,
      indicator: indicatorForText(`${step.label} ${step.instruction}`),
    });
  }
  return sections;
}

/**
 * The preview has explicit step kinds and repeat counts. A repeat header is
 * therefore shown only when the authored run/walk pair states the same count.
 */
export function presentPreviewTimeline(session: First5kDraftSession): readonly WorkoutTimelineSection[] {
  const groups: Array<{ id: string; title: string; rows: WorkoutTimelineRow[]; source: First5kDraftSession['steps'][number][] }> = [];
  for (const step of session.steps) {
    const section = previewSection(step.kind);
    let destination = groups[groups.length - 1];
    if (!destination || destination.id !== section.id) {
      destination = { ...section, rows: [], source: [] };
      groups.push(destination);
    }
    destination.source.push(step);
    const duration = step.seconds === null ? null : formatSeconds(step.seconds);
    const isEvent = step.kind === 'event';
    destination.rows.push({
      id: `${destination.rows.length}-${step.kind}`,
      primary: isEvent ? '5K completion event' : `${duration} · ${previewStepName(step.kind)}`,
      secondary: isEvent
        ? '5K · duration not prescribed'
        : step.rpe === null ? null : `Effort · ${step.rpe}`,
      indicator: indicatorForPreviewKind(step.kind),
    });
  }
  return groups.map(({ source, ...section }) => ({
    ...section,
    detail: repeatDetail(source),
  }));
}

function authoredSection(step: AuthoredStep) {
  const value = step.label.toLowerCase();
  if (/warm.?up/.test(value)) return { id: 'warmup', title: 'Warm-up', detail: null };
  if (/cool.?down/.test(value)) return { id: 'cooldown', title: 'Cool-down', detail: null };
  return { id: 'session', title: 'Session', detail: null };
}

function previewSection(kind: First5kDraftSession['steps'][number]['kind']) {
  if (kind === 'warmup') return { id: 'warmup', title: 'Warm-up' };
  if (kind === 'cooldown') return { id: 'cooldown', title: 'Cool-down' };
  if (kind === 'event') return { id: 'event', title: 'Completion event' };
  return { id: 'main', title: 'Main set' };
}

function repeatDetail(steps: readonly First5kDraftSession['steps'][number][]) {
  if (steps.length !== 2 || !steps.every((step) => step.kind === 'run' || step.kind === 'walk')) return null;
  const [first, second] = steps;
  return first.repeats > 1 && first.repeats === second.repeats ? `Repeat × ${first.repeats}` : null;
}

function indicatorForText(value: string): WorkoutStepIndicator {
  const normalized = value.toLowerCase();
  if (/walk/.test(normalized)) return 'WALK';
  if (/recover|rest/.test(normalized)) return 'REST';
  if (/run|work/.test(normalized)) return 'RUN';
  return 'STEP';
}

function indicatorForPreviewKind(kind: First5kDraftSession['steps'][number]['kind']): WorkoutStepIndicator {
  const indicators: Record<First5kDraftSession['steps'][number]['kind'], WorkoutStepIndicator> = { warmup: 'WALK', run: 'RUN', walk: 'WALK', cooldown: 'WALK', event: 'EVENT' };
  return indicators[kind];
}
