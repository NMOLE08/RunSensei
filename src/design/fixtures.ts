export type FixtureState = 'planned' | 'rest' | 'empty' | 'completed' | 'error';

export type FixtureSession = {
  id: string;
  title: string;
  target?: string;
  purpose: string;
  effort?: string;
  status: FixtureState;
  dateLabel: string;
};

export const fixtureNotice = 'Development fixture — not a personalised training recommendation.';

export const fixtureWeek = [
  { day: 'MON', date: '12', state: 'rest' as const },
  { day: 'TUE', date: '13', state: 'planned' as const },
  { day: 'WED', date: '14', state: 'rest' as const },
  { day: 'THU', date: '15', state: 'planned' as const },
  { day: 'FRI', date: '16', state: 'rest' as const },
  { day: 'SAT', date: '17', state: 'planned' as const },
  { day: 'SUN', date: '18', state: 'rest' as const },
];

export const fixtureSessions: FixtureSession[] = [
  { id: 'easy-fixture', title: 'Easy run', target: '35 min', purpose: 'A comfortable, conversational effort.', effort: 'Easy effort', status: 'planned', dateLabel: 'Tue 13' },
  { id: 'rest-fixture', title: 'Recovery day', purpose: 'Rest is the intended action today.', status: 'rest', dateLabel: 'Wed 14' },
  { id: 'long-fixture', title: 'Long run', target: '50 min', purpose: 'A fixture used to demonstrate a longer session row.', effort: 'Steady, comfortable effort', status: 'planned', dateLabel: 'Sat 17' },
];

export const fixtureCompletedSession: FixtureSession = {
  ...fixtureSessions[0],
  status: 'completed',
  dateLabel: 'Tue 06',
};
