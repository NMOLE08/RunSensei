export type HalfMarathonPathwayChoice = 'foundation' | 'event_preparation';

export type HalfMarathonPathwayIntent = Readonly<{
  ownerId: string;
  goal: 'half_marathon';
  choice: HalfMarathonPathwayChoice;
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
}>;
