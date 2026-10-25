/**
 * TRACK — shared dashboard stat tile.
 *
 * White card, uppercase micro-label, big navy number (frontend .stat-card /
 * .stat-value), with optional status tone on the value. One component replaces
 * the four per-dashboard tile variants that had drifted (different card
 * backgrounds, a stray value-wrapper on student only).
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '../../theme';

type StatTileProps = {
  label: string;
  value: number | string;
  /** Tints the number (and adds the tone label colour). Default: navy. */
  tone?: 'navy' | 'green' | 'amber' | 'red';
  style?: StyleProp<ViewStyle>;
};

const TONE_COLORS = {
  navy: colors.navy800,
  green: colors.green700,
  amber: colors.amber700,
  red: colors.red700,
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
    gap: 4,
    flexGrow: 1,
    flexBasis: '46%',
    ...shadows.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSubtle,
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
  },
});
