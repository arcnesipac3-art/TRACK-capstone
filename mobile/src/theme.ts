/**
 * TRACK — mobile design tokens.
 *
 * These mirror the CSS variables in `frontend/src/index.css` so the web app
 * and this app read as one product. Values are copied, not derived, because
 * React Native has no CSS custom properties — keep the two files in sync when
 * the palette changes.
 */

export const colors = {
  /* Brand */
  navy900: '#0a1630',
  navy800: '#0f2044',
  navy700: '#16305f',
  navy600: '#1e4180',

  /* Accents */
  blue700: '#1d4ed8',
  blue600: '#2563eb',
  blue100: '#dbeafe',
  blue50: '#eff5ff',

  /* Status — each has a text-on-tint pair that clears 4.5:1 */
  green700: '#15803d',
  green100: '#e3f5e9',
  amber700: '#a35a06',
  amber100: '#fdf1de',
  red700: '#b3261e',
  red100: '#fce9e7',

  /* Neutrals */
  gray100: '#eef1f6',
  gray200: '#e3e8f0',

  /* Surfaces & text */
  bg: '#f4f6fa',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e3e8f0',
  borderStrong: '#cdd6e4',
  text: '#0f172a',
  textMuted: '#56627a',
  textSubtle: '#5c687d',
  onNavy: '#ffffff',
  onNavyMuted: '#a9bddf',
} as const;

/** Decorative scrim used behind modal content (mirrors the web modal backdrop). */
export const scrim = 'rgba(10, 22, 48, 0.45)';

/**
 * Elevation presets. React Native has no box-shadow shorthand, so the web
 * --shadow-sm / --shadow tokens are expressed as the RN shadow quartet.
 */
export const shadows = {
  sm: {
    shadowColor: '#0a1630',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0a1630',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  subtle: { fontSize: 12, color: colors.textSubtle },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  buttonText: { fontSize: 16, fontWeight: '700' as const },
} as const;

/** Status tone -> { text, background }. Mirrors the web StatusBadge. */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

export const tones: Record<Tone, { text: string; background: string }> & { [k: string]: { text: string; background: string } } = {
  green: { text: colors.green700, background: colors.green100 },
  amber: { text: colors.amber700, background: colors.amber100 },
  red: { text: colors.red700, background: colors.red100 },
  blue: { text: colors.blue700, background: colors.blue100 },
  gray: { text: colors.textMuted, background: colors.gray100 },
};
