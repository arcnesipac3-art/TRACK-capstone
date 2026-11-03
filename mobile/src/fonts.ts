/**
 * TRACK — Lato, loaded once at boot.
 *
 * Khan Academy sets everything in Lato, which ships four static cuts
 * (300/400/700/900 — no 500 or 600, which is why `theme.ts` forbids those
 * weights). All four faces are declared under the single family name `Lato` so
 * a screen writes `fontFamily: 'Lato'` and lets `fontWeight` choose the face:
 * the browser selects it from the CSS `font-weight`, Android from the declared
 * weight, and iOS from each file's own metadata.
 *
 * `useFonts` loads a family once, so every face has to be listed here — a later
 * call naming `Lato` again adds nothing.
 */
import { useFonts } from 'expo-font';

import { Lato_300Light } from '@expo-google-fonts/lato/300Light';
import { Lato_400Regular } from '@expo-google-fonts/lato/400Regular';
import { Lato_700Bold } from '@expo-google-fonts/lato/700Bold';
import { Lato_900Black } from '@expo-google-fonts/lato/900Black';

import { fontFamily } from './theme';

const lato = [
  {
    fontFamily,
    fontDefinitions: [
      { path: Lato_300Light, weight: 300 },
      { path: Lato_400Regular, weight: 400 },
      { path: Lato_700Bold, weight: 700 },
      { path: Lato_900Black, weight: 900 },
    ],
  },
];

/** True once Lato is ready to render. Gate the first paint on it. */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(lato);
}
