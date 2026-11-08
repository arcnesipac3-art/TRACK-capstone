/**
 * TRACK — status badge.
 *
 * Two shapes with two meanings: a `chip` (square-ish, 8dp) is a verdict about the
 * thing — verified, overdue, voided — while a `pill` is a category the row belongs to,
 * and a `dot` is a state that has to fit in a 44dp header without stealing the name.
 *
 * The tone supplies a text/tint pair measured to stay readable at 12px, so status
 * never depends on colour alone: the glyph carries the shape as well.
 *
 * One component replaces the ten hand-rolled inline badge styles that had drifted to
 * three different font sizes.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { radius, spacing, tones, typography, type Tone } from '../../theme';

/**
 * Only the five status tones have a default mark. `navy`, `violet` and `teal` are
 * category tones — a section, a group, an "other" — and a category carries no verdict,
 * so it gets a colour and no symbol unless the caller names one.
 */
const TONE_GLYPHS: Partial<Record<Tone, string>> = {
  green: '✓',
  amber: '◷',
  red: '!',
  blue: '→',
  gray: '·',
};

type BadgeProps = {
  label: string;
  tone?: Tone;
  /** true = the tone's default glyph, a string = a custom one, false = none. */
  glyph?: boolean | string;
  shape?: 'chip' | 'pill' | 'dot';
  style?: StyleProp<TextStyle>;
};

export default function Badge({ label, tone = 'gray', glyph = true, shape = 'chip', style }: BadgeProps) {
  const palette = tones[tone] ?? tones.gray;

  if (shape === 'dot') {
    return (
      <View style={[styles.dotWrap, style]} accessibilityLabel={`${label} status`}>
        <View style={[styles.dot, { backgroundColor: palette.text }]} />
        <Text style={[styles.dotLabel, style]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  const symbol = glyph === true ? TONE_GLYPHS[tone] ?? '' : glyph === false ? '' : glyph;

  return (
    <View
      style={[
        styles.badge,
        shape === 'pill' && styles.pill,
        { backgroundColor: palette.background },
        style,
      ]}
    >
      {symbol ? <Text style={[styles.text, { color: palette.text }]}>{symbol}</Text> : null}
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
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
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md },
  text: { ...typography.subtle, fontWeight: '700', letterSpacing: 0.2 },
  dotWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotLabel: { ...typography.subtle, fontWeight: '700' },
});
