import { formatTarget } from '@/domain/training/prescription';
import type { SessionAssignment, SessionResolution } from '@/domain/training/entities';
import { assignmentsForWeek, dayStripDates, sessionsForDate, weekProgressSummary } from '@/features/execution/viewModel';

const prescription = JSON.stringify({ week: 1, target: { durationSeconds: 1800 }, purpose: 'Aerobic development.', effortCue: 'Conversational effort.', steps: [{ label: 'Run', instruction: 'Run easily.', durationSeconds: 1800 }], approvedAlternatives: ['Walk if needed.'] });
const assignment = (id: string, plannedDate: `${number}-${number}-${number}`): SessionAssignment => ({ id, logicalSessionId: `logical-${id}`, revisionId: 'revision-1', plannedDate, phase: 'base', role: 'easy', prescriptionJson: prescription });

describe('persisted execution plan view model', () => {
  it('preserves completed and unresolved historical states without creating workout debt', () => {
    const completed: SessionResolution = { id: 'resolution-1', sessionId: 'logical-done', revisionId: 'revision-1', kind: 'completed', reason: null, eventId: 'event-1', createdAt: '2026-10-24T00:00:00.000Z' };
    expect(sessionsForDate([assignment('done', '2026-10-20')], [completed], '2026-10-20', '2026-10-24')[0]?.state).toBe('completed');
    expect(sessionsForDate([assignment('missed', '2026-10-20')], [], '2026-10-20', '2026-10-24')[0]?.state).toBe('past_unresolved');
  });

  it('selects a Monday-to-Sunday week and labels a strip across a month boundary', () => {
    const sessions = [assignment('a', '2026-10-26'), assignment('b', '2026-11-01'), assignment('c', '2026-11-02')];
    expect(assignmentsForWeek(sessions, '2026-11-01').map((item) => item.id)).toEqual(['a', 'b']);
    expect(dayStripDates('2026-11-01')).toEqual([{ day: 'MON', date: '2026-10-26' }, { day: 'TUE', date: '2026-10-27' }, { day: 'WED', date: '2026-10-28' }, { day: 'THU', date: '2026-10-29' }, { day: 'FRI', date: '2026-10-30' }, { day: 'SAT', date: '2026-10-31' }, { day: 'SUN', date: '2026-11-01' }]);
  });

  it('derives weekly progress from assignments and current resolutions only', () => {
    const assignments = [assignment('done', '2026-10-26'), assignment('partial', '2026-10-28'), assignment('unreported', '2026-10-29'), assignment('future', '2026-11-01')];
    const resolutions: SessionResolution[] = [
      { id: 'r1', sessionId: 'logical-done', revisionId: 'revision-1', kind: 'completed', reason: null, eventId: 'e1', createdAt: '2026-10-26T10:00:00.000Z' },
      { id: 'r2', sessionId: 'logical-partial', revisionId: 'revision-1', kind: 'partial', reason: null, eventId: 'e2', createdAt: '2026-10-28T10:00:00.000Z' },
    ];
    expect(weekProgressSummary(assignments, resolutions, '2026-10-30', '2026-10-30')).toEqual({ scheduled: 4, completed: 1, partial: 1, unreported: 1, upcoming: 1 });
  });

  it('formats only authored targets at the display boundary', () => {
    const parsed = sessionsForDate([assignment('target', '2026-10-24')], [], '2026-10-24', '2026-10-24')[0]?.prescription;
    expect(parsed && formatTarget(parsed, 'metric')).toBe('30 min');
    expect(formatTarget({ week: 1, target: {}, purpose: '', effortCue: '', steps: [], approvedAlternatives: [] }, 'imperial')).toBeNull();
  });
});
