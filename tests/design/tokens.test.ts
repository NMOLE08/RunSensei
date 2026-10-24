import { colors, radius, spacing } from '@/design/tokens';

describe('Phase 2 design tokens', () => {
  it('keeps the approved visual-system values centralized', () => {
    expect(colors).toMatchObject({ canvas: '#EAEAEA', surface: '#FFFFFF', ink: '#0C0C0D', periwinkle: '#7575D8', accentInk: '#4646A6' });
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32]);
    expect(Object.values(radius)).toEqual([6, 8, 12]);
  });

  it('uses dark ink for small white-on-dark controls rather than periwinkle', () => {
    expect(colors.onInk).toBe('#FFFFFF');
    expect(colors.ink).not.toBe(colors.periwinkle);
  });
});
