import { addCalendarDays } from '@/domain/calendar/operations';
import { decodePrescription, type AuthoredPrescription } from '@/domain/training/prescription';
import type { SessionAssignment, SessionResolution } from '@/domain/training/entities';

export type ExecutionState = 'scheduled' | 'completed' | 'partial' | 'skipped' | 'past_unresolved' | 'future' | 'unavailable';
export type DisplaySession = { assignment: SessionAssignment; prescription: AuthoredPrescription; state: ExecutionState };
export type WeekProgressSummary = { scheduled: number; completed: number; partial: number; unreported: number; upcoming: number };
export function sessionsForDate(assignments: SessionAssignment[], resolutions: SessionResolution[], date: string, today: string): DisplaySession[] { return assignments.filter((assignment) => assignment.plannedDate === date).flatMap((assignment) => { const prescription = decodePrescription(assignment.prescriptionJson); if (!prescription) return []; const resolution = resolutions.find((item) => item.sessionId === assignment.logicalSessionId && item.revisionId === assignment.revisionId); const state = resolution?.kind === 'completed' ? 'completed' : resolution?.kind === 'partial' ? 'partial' : resolution?.kind === 'skipped' ? 'skipped' : date < today ? 'past_unresolved' : date > today ? 'future' : 'scheduled'; return [{ assignment, prescription, state }]; }); }
export function assignmentsForWeek(assignments: SessionAssignment[], selectedDate: string): SessionAssignment[] { const start = addCalendarDays(selectedDate as `${number}-${number}-${number}`, -weekdayIndex(selectedDate)); const end = addCalendarDays(start, 6); return assignments.filter((assignment) => assignment.plannedDate >= start && assignment.plannedDate <= end).sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.id.localeCompare(right.id)); }
export function weekProgressSummary(assignments: SessionAssignment[], resolutions: SessionResolution[], selectedDate: string, today: string): WeekProgressSummary {
  const summary: WeekProgressSummary = { scheduled: 0, completed: 0, partial: 0, unreported: 0, upcoming: 0 };
  for (const assignment of assignmentsForWeek(assignments, selectedDate)) {
    const session = sessionsForDate([assignment], resolutions, assignment.plannedDate, today)[0];
    if (!session) continue;
    summary.scheduled += 1;
    if (session.state === 'completed') summary.completed += 1;
    else if (session.state === 'partial') summary.partial += 1;
    else if (session.state === 'past_unresolved') summary.unreported += 1;
    else if (session.state === 'future' || session.state === 'scheduled') summary.upcoming += 1;
  }
  return summary;
}
export function dayStripDates(selectedDate: string): { day: string; date: string }[] { const start = addCalendarDays(selectedDate as `${number}-${number}-${number}`, -weekdayIndex(selectedDate)); return ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, index) => ({ day, date: addCalendarDays(start, index) })); }
export function localDateOnly(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function weekdayIndex(date: string): number { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return day === 0 ? 6 : day - 1; }
