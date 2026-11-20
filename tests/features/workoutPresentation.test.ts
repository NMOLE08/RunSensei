import { displayStepName, formatSeconds, presentAuthoredTimeline, presentAuthoredWorkout, presentPreviewTimeline, presentPreviewWorkout, previewStepName } from '@/features/execution/workoutPresentation';
import { simulateFirst5kDraft } from '@/domain/planning/first5kPolicyPack';

describe('workout presentation', () => {
  const simulation = simulateFirst5kDraft('2026-11-02', [0, 3, 5]);
  if (simulation.kind !== 'draft_simulation') throw new Error('Expected bundled draft sessions');

  it('turns authored run/walk structure into a descriptive card without creating pace or distance values', () => {
    const session = simulation.sessions[0]!;
    expect(presentPreviewWorkout(session)).toEqual(expect.objectContaining({ title: 'Run / walk intervals', category: 'Run / walk', target: '28 min', summary: expect.stringContaining('run') }));
    expect(presentPreviewWorkout(session).summary).toContain('walk');
  });

  it('preserves an unknown-duration 5K event rather than estimating a time', () => {
    const event = simulation.sessions.find((session) => session.distanceMeters === 5000)!;
    expect(presentPreviewWorkout(event)).toMatchObject({ title: '5K completion event', target: '5K', summary: '5K · time is not prescribed' });
  });

  it('presents persisted authored steps from their real targets only', () => {
    const workout = presentAuthoredWorkout({ week: 1, target: { durationSeconds: 1800 }, purpose: 'Aerobic work.', effortCue: 'Conversational effort.', approvedAlternatives: [], steps: [
      { label: 'Warm-up', instruction: 'Walk comfortably.', durationSeconds: 300 },
      { label: 'Run', instruction: 'Run easily.', durationSeconds: 1200 },
      { label: 'Cool-down', instruction: 'Walk easily.', durationSeconds: 300 },
    ] }, 'easy', 'metric');
    expect(workout).toMatchObject({ title: 'Easy run', target: '30 min', summary: '5 min · 20 min · 5 min' });
    expect(displayStepName({ label: 'Warm-up', instruction: '', durationSeconds: 300 })).toBe('Warm-up');
    expect(displayStepName({ label: 'Walk recovery', instruction: '', durationSeconds: 60 })).toBe('Walking recovery');
  });

  it('formats real timing and phase labels consistently', () => {
    expect(formatSeconds(65)).toBe('1 min 5 sec');
    expect(previewStepName('walk')).toBe('Walking recovery');
    expect(previewStepName('event')).toBe('5K completion event');
  });

  it('gives an easy run a clear target-first timeline while retaining every authored instruction', () => {
    const steps = [
      { label: 'Warm-up', instruction: 'Walk comfortably.', durationSeconds: 300 },
      { label: 'Run', instruction: 'Run at conversational effort.', distanceMeters: 5500 },
      { label: 'Cool-down', instruction: 'Walk easily.', durationSeconds: 300 },
    ];
    const timeline = presentAuthoredTimeline(steps, 'metric');
    expect(timeline.map((section) => section.title)).toEqual(['Warm-up', 'Session', 'Cool-down']);
    expect(timeline[1]?.rows[0]).toEqual(expect.objectContaining({ primary: '5.5 km · Running', secondary: 'Run at conversational effort.', indicator: 'RUN' }));
    expect(timeline.flatMap((section) => section.rows.map((row) => row.secondary))).toEqual(expect.arrayContaining(['Walk comfortably.', 'Run at conversational effort.', 'Walk easily.']));
  });

  it('keeps a progressive session ordered and preserves distinct pace instructions', () => {
    const timeline = presentAuthoredTimeline([
      { label: 'Run', instruction: 'Conversational pace.', distanceMeters: 2500 },
      { label: 'Run', instruction: '9:15/km.', distanceMeters: 2000 },
      { label: 'Run', instruction: '9:10/km.', distanceMeters: 2000 },
      { label: 'Run', instruction: 'Conversational pace.', distanceMeters: 500 },
    ], 'metric');
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.rows.map((row) => row.primary)).toEqual(['2.5 km · Running', '2.0 km · Running', '2.0 km · Running', '0.5 km · Running']);
    expect(timeline[0]?.rows.map((row) => row.secondary)).toEqual(['Conversational pace.', '9:15/km.', '9:10/km.', 'Conversational pace.']);
  });

  it('shows an authored run/walk pair as a repeat only when the source explicitly supplies matching repetitions', () => {
    const session = simulation.sessions[0]!;
    const timeline = presentPreviewTimeline(session);
    expect(timeline.map((section) => section.title)).toEqual(['Warm-up', 'Main set', 'Cool-down']);
    expect(timeline[1]).toEqual(expect.objectContaining({ detail: expect.stringMatching(/^Repeat × /) }));
    expect(timeline[1]?.rows.map((row) => row.primary)).toEqual(expect.arrayContaining([expect.stringContaining('Run'), expect.stringContaining('Walking recovery')]));
    expect(timeline[1]?.rows.map((row) => row.secondary)).toEqual(expect.arrayContaining(['Effort · 3-4', 'Effort · 1-3']));
  });

  it('does not invent repeat groups for flattened active-plan steps', () => {
    const timeline = presentAuthoredTimeline([
      { label: 'Run', instruction: 'Easy effort.', durationSeconds: 60 },
      { label: 'Walk recovery', instruction: 'Walk gently.', durationSeconds: 120 },
      { label: 'Run', instruction: 'Easy effort.', durationSeconds: 60 },
      { label: 'Walk recovery', instruction: 'Walk gently.', durationSeconds: 120 },
    ], 'metric');
    expect(timeline).toEqual([expect.objectContaining({ title: 'Session', detail: null })]);
    expect(timeline[0]?.rows.map((row) => row.primary)).toEqual(['1 min · Running', '2 min · Walking recovery', '1 min · Running', '2 min · Walking recovery']);
  });

  it('keeps an event duration unknown rather than creating a duration value', () => {
    const event = simulation.sessions.find((session) => session.distanceMeters === 5000)!;
    const section = presentPreviewTimeline(event).find((item) => item.title === 'Completion event');
    expect(section?.rows).toEqual([expect.objectContaining({ primary: '5K completion event', secondary: '5K · duration not prescribed', indicator: 'EVENT' })]);
  });
});
