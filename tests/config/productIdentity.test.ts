import { productIdentity, SENSEI_NAME, TORTO_NAME } from '@/config/productIdentity';

describe('product identity', () => {
  it('uses Torto as the application and Sensei as its coaching experience', () => {
    expect(productIdentity).toEqual({ applicationName: 'Torto', coachingExperienceName: 'Sensei' });
    expect(TORTO_NAME).toBe('Torto');
    expect(SENSEI_NAME).toBe('Sensei');
  });
});
