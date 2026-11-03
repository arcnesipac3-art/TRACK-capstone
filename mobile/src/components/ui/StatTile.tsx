/**
 * TRACK — shared dashboard stat tile.
 *
 * White card, 8dp corner, hairline border: an uppercase micro-label and the
 * number under it, in the tone that says whether the figure is a good state or
 * the one to act on. One component replaces the four per-dashboard tile variants
 * that had drifted (different card backgrounds, a stray value-wrapper on
 * student only).
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

type StatTileProps = {
  label: string;
  value: number | string;
  /** Tints the number (and adds the tone label colour). Default: navy. */
  tone?: 'navy' | 'green' | 'amber' | 'red';
  style?: StyleProp<ViewStyle>;
};

const TONE_COLORS = {
  navy: colors.navy,
  green: colors.greenText,
  amber: colors.amberText,
  red: colors.redText,
} as const;

export default function StatTile({ label, value, tone = 'navy', style }: StatTileProps) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label} numberOfLines={2}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.value, { color: TONE_COLORS[tone] }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    flexGrow: 1,
    flexBasis: '46%',
  },
  label: {
    ...typography.label,
    color: colors.textSubtle,
  },
  value: { ...typography.metric },
});
