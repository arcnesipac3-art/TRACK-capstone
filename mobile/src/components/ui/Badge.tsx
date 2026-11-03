/**
 * TRACK — shared status badge.
 *
 * A rectangular chip, not a pill: Khan Academy reserves the pill for things you
 * tap and the 4dp square for labels that only tell you something. The tone
 * supplies a text/tint pair that is readable at 12px, so status never depends on
 * colour alone — the glyph still carries the shape.
 *
 * One component replaces the ten hand-rolled inline badge styles that had
 * drifted to three different font sizes.
 */
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, tones, typography, type Tone } from '../../theme';

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
    gap: spacing.xs,
    minHeight: 22,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: {
    ...typography.subtle,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
