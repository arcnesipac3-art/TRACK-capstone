/**
 * TRACK — icon-chip list row.
 *
 * Khan Academy's Explore screen is a column of rows like this: a 48dp circular
 * tinted chip holding one icon, the name of the thing, one quiet line about it,
 * and a chevron that says it goes somewhere. The chip is the only decoration —
 * the app has no spot art, so colour does the work of making a list scannable
 * without making it loud.
 *
 * Titles and subtitles are always clamped (`numberOfLines`) so a long learner
 * name or section code pushes a row taller than its neighbours.
 */
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tones, typography, type Tone } from '../../theme';

/** Ionicons glyph name, without importing the whole icon-map type. */
type Glyph = ComponentProps<typeof Ionicons>['name'];

type ListRowProps = {
  icon: Glyph;
  /** Tone of the chip. `blue` is the default because most rows are a thing you can open. */
  tone?: Tone;
  title: string;
  subtitle?: string;
  /** Right-aligned text — a count, an amount, a time. */
  meta?: string;
  /** Replaces `meta` when the right side needs a status badge instead. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Off for rows that only display (a read-only list has no chevron to chase). */
  chevron?: boolean;
  /** Hairline below the row. Rows stacked inside a <Card padded={false}> are one list. */
  divider?: boolean;
};

export default function ListRow({
  icon,
  tone = 'blue',
  title,
  subtitle,
  meta,
  trailing,
  onPress,
  chevron = true,
  divider = false,
}: ListRowProps) {
  const chip = tones[tone] ?? tones.blue;

  const body = (
    <>
      <View style={[styles.chip, { backgroundColor: chip.background }]}>
        <Ionicons name={icon} size={22} color={chip.text} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (meta ? <Text style={styles.meta}>{meta}</Text> : null)}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.row, divider && styles.divider]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.row, divider && styles.divider]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chip: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.body, fontWeight: '700', color: colors.text },
  subtitle: { ...typography.muted },
  meta: { ...typography.muted, fontWeight: '700', color: colors.textMuted, flexShrink: 0 },
});
