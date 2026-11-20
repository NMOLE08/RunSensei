import { colors, palette, radius, spacing } from '@/design/tokens';

describe('Phase 2 design tokens', () => {
  it('keeps the approved visual-system values centralized', () => {
    expect(palette).toEqual({ ivory: '#F2EBDD', ink: '#202522', moss: '#65735B', coral: '#F16447', butter: '#F9D442', white: '#FFFDF8' });
    expect(colors).toMatchObject({ canvas: palette.ivory, surface: palette.white, ink: palette.ink, moss: palette.moss, coral: palette.coral, butter: palette.butter });
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32, 48, 40]);
    expect(Object.values(radius)).toEqual([8, 12, 18, 999]);
  });

  it('uses dark ink for small white-on-dark controls rather than periwinkle', () => {
    expect(colors.onInk).toBe('#FFFDF8');
    expect(colors.ink).not.toBe(colors.coral);
  });
});
