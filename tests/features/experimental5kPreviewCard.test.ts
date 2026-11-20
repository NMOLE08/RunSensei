import { calendarMonthYear, initialPreviewWeek, movePreviewWeek, previewWorkoutName, shortWorkoutLabel } from '@/features/execution/Experimental5kPreviewCard';
import { simulateFirst5kDraft } from '@/domain/planning/first5kPolicyPack';

describe('5K preview presentation', () => {
  const simulation = simulateFirst5kDraft('2026-11-02', [0, 3, 5]);
  if (simulation.kind !== 'draft_simulation') throw new Error('Expected the bundled preview fixture');
  const runWalk = simulation.sessions[0]!;
  const event = simulation.sessions.find((session) => session.distanceMeters === 5000)!;

  it('opens a newly mounted preview at week 1 and bounds week navigation', () => {
    expect(initialPreviewWeek()).toBe(1);
    expect(movePreviewWeek(1, -1)).toBe(1);
    expect(movePreviewWeek(1, 1)).toBe(2);
    expect(movePreviewWeek(12, 1)).toBe(12);
  });

  it('uses calendar dates for the displayed month and descriptive workout labels', () => {
    expect(calendarMonthYear([{ date: '2026-11-02' }])).toMatch(/November.*2026/);
    expect(previewWorkoutName(runWalk)).toBe('Run/walk workout');
    expect(shortWorkoutLabel(runWalk)).toBe('R/W');
    expect(previewWorkoutName(event)).toBe('5K event');
    expect(shortWorkoutLabel(event)).toBe('5K');
  });
});
