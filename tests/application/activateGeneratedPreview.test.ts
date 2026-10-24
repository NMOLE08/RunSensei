import { activateGeneratedPreview } from '@/application/activateGeneratedPreview';
import { TrainingRepository } from '@/data/repositories';
import { demoHalfRules, demoHalfTemplate } from '@/domain/training/demoContent';
import { generatePlan } from '@/domain/training/engine';
import { MemoryDatabase } from '@/../tests/support/memoryDatabase';

it('rejects demo preview production activation before persistence', async () => { const repository = new TrainingRepository(new MemoryDatabase()); const result = generatePlan({ profile: { entryRequirementsMet: true }, goal: { mode: 'flexible', startDate: '2026-11-02', raceDate: null, distanceMeters: 21097 }, availability: { weekdayMinuteLimits: { 1: 45, 3: 45, 6: 60 }, preferredLongRunDay: 6, unavailableDates: [] }, templateMode: 'demo' }, demoHalfTemplate, demoHalfRules); if (result.kind !== 'preview') throw new Error('Expected preview'); await expect(activateGeneratedPreview(repository, result.preview, demoHalfTemplate, demoHalfRules, {} as never, {} as never)).rejects.toThrow('Only reviewed non-demo'); });
