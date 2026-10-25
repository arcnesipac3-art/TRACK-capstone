/**
 * TRACK — shared status badge.
 *
 * Pill badge with a tone tint and optional glyph prefix, mirroring the web
 * StatusBadge (frontend: green ✓ / amber ◷ / red ! / blue →). One component
 * replaces the ten hand-rolled inline badge styles that had drifted to three
 * different font sizes.
 */
import { StyleSheet, Text, View } from 'react-native';

import { spacing, tones, type Tone } from '../../theme';

const TONE_GLYPHS: Record<Tone, string> = {
  green: '✓',
  amber: '◷',
  red: '!',
  blue: '→',
  gray: '·',
};

type BadgeProps = {
  label: string;
  tone?: Tone;
  /** true = tone's default glyph, a string = custom glyph, false = none. */
  glyph?: boolean | string;
};

export default function Badge({ label, tone = 'gray', glyph = true }: BadgeProps) {
  const text = tones[tone] ?? tones.gray;
  const symbol = glyph === true ? TONE_GLYPHS[tone] ?? '' : glyph === false ? '' : glyph;

  return (
    <View style={[styles.badge, { backgroundColor: text.background }]}>
      {symbol ? <Text style={[styles.text, { color: text.text }]}>{symbol}</Text> : null}
      <Text style={[styles.text, { color: text.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
