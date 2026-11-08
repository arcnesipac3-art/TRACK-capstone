/**
 * TRACK — mobile design tokens.
 *
 * The two brand colours are the official ones: navy `#123B70` and bright blue
 * `#2196F3`. Everything else in the brand block is *derived* from them and is
 * marked as such, because `#2196F3` — a Material 500 — is 3.1:1 against white,
 * which is fine for a bar or an icon and not fine for a button label or 12px
 * text. The darker steps exist so a screen can be brand-coloured and still
 * readable, not so it can be louder.
 *
 * Naming is semantic, not ramp-numbered: `blue` is the colour you draw with,
 * `bluePress` is the surface you press, `blueText` is blue small enough to read,
 * `blueTint` is the chip behind it. Screens must never carry a hex literal — if
 * a colour is not here, add it here first.
 *
 * Geometry is a 4-point grid. Density is deliberate: the gutter is 16, not 24,
 * and a phone screen is ~360dp wide, so a page that pads itself like a desktop
 * spends a third of it on air.
 */

/** Loaded at boot from `src/fonts.ts`; every `typography.*` entry uses it. */
export const fontFamily = 'Lato';

export const colors = {
  /* Brand --------------------------------------------------------------- */
  /** Official TRACK navy. Headings, dark surfaces, the identity of the app. */
  navy: '#123b70',
  /** Derived: navy pressed further. Scrim base, sheet handles, pressed navy. */
  navyDeep: '#0b2a50',
  /** Derived: navy opened up. Secondary dark surface, chart's second hue. */
  navySoft: '#1e4e8c',
  /** Official TRACK bright blue. Bars, dots, icons, selection — not small text. */
  blue: '#2196f3',

  /* Blue, at the steps a screen actually needs */
  /** Derived. The filled control a white label sits on: 4.6:1 against white. */
  bluePress: '#1976d2',
  /** Derived. Blue used as type — 6.1:1 on white, 5.3:1 on `blueTint`. */
  blueText: '#0d63b3',
  /** The chip, the selected segment, the current row. */
  blueTint: '#e3f2fd',
  /** Paler still — full-width washes, zebra rows, expanded panels. */
  blueWash: '#f1f7fe',

  /* Status — each trio is {graphic hue, text-on-tint, tint background} ------
   * The `*Text` / `*Tint` pairs are measured at 4.5:1 or better so a badge is
   * readable at 12px. The bare hues are for bars, dots and icons only — the
   * warning and success hues sit near the 3:1 graphical threshold, not the 4.5
   * text one, and must never carry type. */
  green: '#1e8e5a',
  greenText: '#14603f',
  greenTint: '#dff3e8',

  gold: '#e39b14',
  amberText: '#8a5a00',
  amberTint: '#fcefdd',

  red: '#d64545',
  redText: '#b3261e',
  redTint: '#fbe7e5',

  /** Reserved for a third family of meaning: counts that are neither good,
   * warning nor wrong (sections, groups, "other"). */
  violet: '#6c4bd6',
  violetText: '#4a34a0',
  violetTint: '#ece7fb',

  teal: '#0e8f87',
  tealText: '#0a6560',
  tealTint: '#dcefea',

  /* Neutrals ------------------------------------------------------------- */
  /** Cool page wash — close enough to white that a card still reads as raised. */
  bg: '#f4f6fa',
  surface: '#ffffff',
  /** The step between the wash and a card: wells, inset groups, idle chips. */
  surfaceAlt: '#fafbfd',
  quietFill: '#edf1f7',
  border: '#e3e8f0',
  borderStrong: '#c9d2e0',

  /* Text ----------------------------------------------------------------- */
  /** Ink, with navy in it so body copy sits under the brand headers, not beside them. */
  text: '#152238',
  /** Secondary copy. */
  textMuted: '#44536b',
  /** Meta lines (timestamps, counts). 4.6:1 on white, 4.7:1 on the page wash. */
  textSubtle: '#616e85',
  onNavy: '#ffffff',
  /** 6.1:1 on `navy` — safe for the header's supporting line. */
  onNavyMuted: '#a9c1e2',

  /* Data visualisation --------------------------------------------------- */
  /** The order a chart walks its categories in. One hue per series, never two
   * adjacent ones from the same family. */
  chart: ['#123b70', '#2196f3', '#0e8f87', '#e39b14', '#6c4bd6', '#d64545'],

  /* Progress semantics --------------------------------------------------- */
  progressTrack: '#dbe2ee',
  progressAttempted: '#fcefdd',
  progressComplete: '#dff3e8',
} as const;

/** Decorative scrim behind a sheet or modal, tinted with the brand navy. */
export const scrim = 'rgba(11, 42, 80, 0.52)';

/**
 * Elevation presets. React Native has no box-shadow shorthand, so the stack is
 * expressed as the RN shadow quartet with the matching `elevation` on Android.
 *
 * Content does not float here: a card is a hairline, and only the things that
 * genuinely rise off the page — the tab island, a sheet, a menu — get a shadow.
 */
export const shadows = {
  /** Row-level surfaces inside a group. */
  sm: {
    shadowColor: '#152238',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  /** Floating controls: the tab island, a menu, a FAB. */
  md: {
    shadowColor: '#0b2a50',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  /** Sheets and modals — the only thing that outranks a sheet. */
  lg: {
    shadowColor: '#0b2a50',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;

/** A 4-point grid. `xl`, not `xxl`, is the page gutter. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  /** Page gutter, and the gap between sections. */
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/**
 * Radii. `lg` is the card; `sheet` is a bottom sheet's top corners; `pill` is
 * for things you tap and `chip` is for things that only tell you something.
 */
export const radius = {
  xs: 6,
  sm: 8,
  /** Chips and inline badges. */
  chip: 8,
  md: 10,
  /** Buttons and inputs. */
  control: 12,
  /** Cards, tiles, wells — the default surface corner. */
  lg: 16,
  xl: 20,
  /** Bottom sheets. */
  sheet: 24,
  /** Avatars and the tab island. */
  pill: 999,
} as const;

/** The minimum height of anything a thumb aims at. */
export const touch = {
  target: 44,
  /** A control inside a row — shorter, because the row itself is the target. */
  inline: 36,
  /**
   * The height of a form control that stands alone: an input, a selector, a sheet field.
   * One number, because a selector and an input side by side in the same form have to
   * end on the same line or the form reads as two different kits.
   */
  control: 48,
} as const;

/**
 * Type scale. Lato ships 300 / 400 / 700 / 900 — there is no 500 or 600, so a
 * weight outside those four renders as a synthesised fake. Use 400 or 700, and
 * 900 only for a figure that has to carry a section on its own.
 *
 * Body is 15, not the web's 16: at a phone's viewing distance 15 is the same
 * readable size and buys back a line in every row of every list.
 */
export const typography = {
  /** Dashboard greeting — the largest thing on a screen. */
  display: { fontFamily, fontSize: 28, lineHeight: 34, fontWeight: '700' as const, color: colors.navy },
  /** Screen name in a header. */
  title: { fontFamily, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, color: colors.navy },
  /** Section heading. */
  heading: { fontFamily, fontSize: 17, lineHeight: 22, fontWeight: '700' as const, color: colors.navy },
  /** The number in a stat tile. */
  metric: { fontFamily, fontSize: 26, lineHeight: 30, fontWeight: '700' as const, color: colors.navy },
  /** One dominant figure, with everything else on the card arranged around it. */
  figure: { fontFamily, fontSize: 34, lineHeight: 38, fontWeight: '900' as const, color: colors.navy },
  /** Sub-heading inside a card, or a row's name. */
  subhead: { fontFamily, fontSize: 15, lineHeight: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontFamily, fontSize: 15, lineHeight: 21, color: colors.text },
  bodyStrong: {
    fontFamily,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700' as const,
    color: colors.text,
  },
  /**
   * `TextInput` text. Inputs keep the web's 16px — below that, iOS zooms on
   * focus, and a field set in the system face next to Lato labels reads as two
   * different apps.
   */
  input: { fontFamily, fontSize: 16, lineHeight: 22, color: colors.text },
  muted: { fontFamily, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  subtle: { fontFamily, fontSize: 12, lineHeight: 16, color: colors.textSubtle },
  caption: { fontFamily, fontSize: 13, lineHeight: 17, color: colors.textMuted },
  label: {
    fontFamily,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700' as const,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  /** Button and link text. */
  buttonText: { fontFamily, fontSize: 15, lineHeight: 20, fontWeight: '700' as const },
  /** Tab-bar label, chip text, count pills. */
  micro: {
    fontFamily,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
} as const;

/**
 * Status tone -> { text, background }. `navy`, `violet` and `teal` are additive
 * to the original five: a screen with four real states should not have to paint
 * two of them grey.
 */
export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'navy' | 'violet' | 'teal';

export const tones: Record<Tone, { text: string; background: string }> & {
  [k: string]: { text: string; background: string };
} = {
  green: { text: colors.greenText, background: colors.greenTint },
  amber: { text: colors.amberText, background: colors.amberTint },
  red: { text: colors.redText, background: colors.redTint },
  blue: { text: colors.blueText, background: colors.blueTint },
  gray: { text: colors.textMuted, background: colors.quietFill },
  navy: { text: colors.navy, background: colors.quietFill },
  violet: { text: colors.violetText, background: colors.violetTint },
  teal: { text: colors.tealText, background: colors.tealTint },
};

/** The hue a tone's *graphic* form takes — bars, dots, icons. */
export const toneHue: Record<Tone, string> = {
  green: colors.green,
  amber: colors.gold,
  red: colors.red,
  blue: colors.blue,
  gray: colors.borderStrong,
  navy: colors.navy,
  violet: colors.violet,
  teal: colors.teal,
};
