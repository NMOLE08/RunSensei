import { migrations } from '@/data/migrations';

it('adds an owner-scoped assessment fingerprint uniqueness constraint without resetting assessment history', () => {
  const migration = migrations.find((item) => item.version === 15);
  expect(migration?.statements.join('\n')).toContain('idx_fitness_assessments_owner_fingerprint');
  expect(migration?.statements.join('\n')).toContain('owner_id, input_fingerprint');
});
