/**
 * TRACK — mobile design tokens.
 *
 * The palette, radii and type scale follow Khan Academy's Wonder Blocks design
 * tokens (the "classic" theme the KA app actually ships): one instructive blue
 * for actions, one dark navy for course/class headers, an off-white page wash,
 * and a hue reserved for each status. Where a token is ours rather than KA's it
 * is marked, because a shade chosen to clear WCAG AA is a decision, not a copy.
 *
 * Naming is semantic, not ramp-numbered: `blue` is the colour you press,
 * `blueText` is blue small enough to read, `blueTint` is the chip behind it.
 * Screens should never carry a hex literal — if a colour is not here, add it
 * here first.
 */

/** Loaded at boot from `src/fonts.ts`; every `typography.*` entry uses it. */
export const fontFamily = 'Lato';

export const colors = {
  /* Brand --------------------------------------------------------------- */
  /** KA `darkBlue` — hero headers, heading type, anything that must feel official. */
  navy: '#0b2149',
  /** KA `blue` — buttons, links, active segments, selection borders, our message bubbles. */
  blue: '#1865f2',

  /* Blue, at the steps a screen actually needs */
  /** #1865F2 on white is 5.0:1; this darker step holds 4.5:1 on the tints below. */
  blueText: '#1450a3',
  /** KA's pale-blue current-row / chip background (`blue_90` family). */
  blueTint: '#edf3fe',
  /** Paler still — full-width row washes, table zebra, expanded panels. */
  blueWash: '#f5f9fe',

  /* Status — each trio is {graphic hue, text-on-tint, tint background} ------
   * The `*Text` / `*Tint` pairs are measured at 4.5:1 or better so a badge is
   * readable at 12px. The bare hues are for bars, dots and icons only — KA's
   * own #00A60E and #FFB100 are 3.3:1 and 1.9:1 on white and must never carry
   * text. */
  green: '#00a60e',
  greenText: '#3c6d4a',
  greenTint: '#bcebbb',

  gold: '#ffb100',
  /** Ours: KA's warning text `#966B00` is 3.9:1 on its `#FEE7AD` field — their
   * documented 3:1 exception. Darkened one step so our badges clear 4.5:1. */
  amberText: '#8a6300',
  amberTint: '#fee7ad',

  red: '#d92916',
  redText: '#be2626',
  redTint: '#fee9e5',

  /** KA reserves purple for mastery; teal for the "correct / present" family. */
  purple: '#9059ff',
  teal: '#14bf96',

  /* Neutrals ------------------------------------------------------------- */
  /** KA grey ramp: page wash, quiet fill, hairline, strong hairline / track. */
  bg: '#f7f8fa',
  surface: '#ffffff',
  surfaceAlt: '#f6f6f6',
  quietFill: '#ededee',
  border: '#e0e0e1',
  borderStrong: '#cbcbcd',

  /* Text ----------------------------------------------------------------- */
  /** KA `offBlack` — body copy. */
  text: '#21242c',
  /** Secondary copy; 8:1, safe on every surface and tint above. */
  textMuted: '#4a4c53',
  /** Meta lines (timestamps, counts). 4.8:1 on white, 4.49:1 on the page wash —
   * KA's own grey, kept for surfaces. */
  textSubtle: '#717279',
  onNavy: '#ffffff',
  onNavyMuted: '#a9bddf',

  /* Progress semantics (KA's mastery colours) ---------------------------- */
  progressTrack: '#cbcbcd',
  progressAttempted: '#fee7ad',
  progressComplete: '#bcebbb',
} as const;

/** Decorative scrim behind modal content, tinted with the brand navy. */
export const scrim = 'rgba(11, 33, 73, 0.45)';

/**
 * Elevation presets. React Native has no box-shadow shorthand, so KA's
 * `0 2 2` / `0 4 8` / `0 8 16` stack is expressed as the RN shadow quartet with
 * the matching `elevation` on Android.
 */
export const shadows = {
  sm: {
    shadowColor: '#21242c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#21242c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#21242c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/** KA's sizing scale is multiples of 8; 4 is the only half-step the app needs. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** KA's radius scale is 0, 1, 4, 8, 12, 24, 50%. Buttons are 4, cards are 8. */
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 24,
  /** Chips, avatars and the tab island. */
  pill: 999,
} as const;

/**
 * Type scale. Lato ships 300 / 400 / 700 / 900 — there is no 500 or 600, so a
 * weight outside those four renders as a synthesised fake. Use 400 or 700.
 */
export const typography = {
  title: { fontFamily, fontSize: 24, lineHeight: 28, fontWeight: '700' as const, color: colors.navy },
  /** Screen name in the navy header — KA's 20/24 heading step. */
  pageTitle: { fontFamily, fontSize: 20, lineHeight: 26, fontWeight: '700' as const, color: colors.onNavy },
  heading: { fontFamily, fontSize: 16, lineHeight: 24, fontWeight: '700' as const, color: colors.navy },
  /** The number in a stat tile; big enough to scan, one line. */
  metric: { fontFamily, fontSize: 24, lineHeight: 28, fontWeight: '700' as const, color: colors.navy },
  body: { fontFamily, fontSize: 16, lineHeight: 20, color: colors.text },
  /** `TextInput` text. Inputs need the same 16px as `body` — below that, iOS
   * zooms on focus, and a field set in the system face next to Lato labels
   * reads as two different apps. */
  input: { fontFamily, fontSize: 16, lineHeight: 20, color: colors.text },
  muted: { fontFamily, fontSize: 14, lineHeight: 18, color: colors.textMuted },
  subtle: { fontFamily, fontSize: 12, lineHeight: 16, color: colors.textSubtle },
  label: {
    fontFamily,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  buttonText: { fontFamily, fontSize: 16, lineHeight: 20, fontWeight: '700' as const },
} as const;

/** Status tone -> { text, background }. Mirrors the web StatusBadge. */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

export const tones: Record<Tone, { text: string; background: string }> & {
  [k: string]: { text: string; background: string };
} = {
  green: { text: colors.greenText, background: colors.greenTint },
  amber: { text: colors.amberText, background: colors.amberTint },
  red: { text: colors.redText, background: colors.redTint },
  blue: { text: colors.blueText, background: colors.blueTint },
  gray: { text: colors.textMuted, background: colors.quietFill },
};
