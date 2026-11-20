/** RunSensei's single source of truth for visual styling. */
export const palette = {
  ivory: '#F2EBDD',
  ink: '#202522',
  moss: '#65735B',
  coral: '#F16447',
  butter: '#F9D442',
  white: '#FFFDF8',
} as const;

export const colors = {
  canvas: palette.ivory,
  canvasRaised: '#F8F3E9',
  surface: palette.white,
  surfaceMuted: '#E9E2D4',
  ink: palette.ink,
  mutedInk: '#626860',
  subtleInk: '#858A82',
  divider: '#D8D1C3',
  dividerStrong: '#B9B4A9',
  moss: palette.moss,
  mossDark: '#465140',
  mossWash: '#DDE4D7',
  coral: palette.coral,
  coralDark: '#C94A34',
  coralWash: '#FCE2DA',
  butter: palette.butter,
  butterWash: '#FFF3B7',
  onInk: '#FFFDF8',
  onAccent: '#202522',
  error: '#A83D32',
  errorWash: '#F9DDD6',
  success: '#3F6849',
  successWash: '#DFEBDD',
  warning: '#795B14',
  warningWash: '#FFF0B3',
  inactive: '#989C94',
  focus: palette.coral,
  overlay: 'rgba(32, 37, 34, 0.42)',
  periwinkle: palette.coral,
  accentInk: '#8F3528',
  accentWash: '#FCE2DA',
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, section: 40 } as const;
export const radius = { small: 8, medium: 12, large: 18, pill: 999 } as const;
export const premiumRadius = { control: 16, card: 24, hero: 32 } as const;
export const fontFamily = { body: 'Inter', mono: 'IBMPlexMono', display: 'PixelifySans' } as const;
export const typography = {
  hero: { fontSize: 40, lineHeight: 44, letterSpacing: -1.3 },
  title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  section: { fontSize: 21, lineHeight: 27, letterSpacing: -0.25 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 11, lineHeight: 16, letterSpacing: 0.8 },
} as const;
export const elevation = {
  card: { shadowColor: palette.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 18, elevation: 2 },
  floating: { shadowColor: palette.ink, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 7 },
} as const;
export const motion = { quick: 140, standard: 220, relaxed: 360 } as const;
