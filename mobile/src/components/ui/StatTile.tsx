/**
 * TRACK — a single figure inside a statistics grid.
 *
 * Kept for the screens that have not moved to `MetricsCard` yet, which owns the
 * better pattern (one surface, hairline rules, one figure given the lead size).
 * As a standalone tile this now uses the same radius, label and tone vocabulary
 * so the two can sit on one screen without looking like different apps.
 */
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useEntrance } from '../../anim';
import { colors, radius, shadows, spacing, tones, typography } from '../../theme';
import type { Tone } from '../../theme';

type StatTileProps = {
  label: string;
  value: number | string;
  /** Tints the number. Default: navy. */
  tone?: Extract<Tone, 'navy' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'teal'>;
  caption?: string;
  style?: StyleProp<ViewStyle>;
};

export default function StatTile({ label, value, tone = 'navy', caption, style }: StatTileProps) {
  // A figure that lands after a load, or changes under a filter, should arrive as
  // new content instead of replacing the old one in place — the screen's own rise,
  // at a quarter of the distance, because four tiles moving 10dp is a shuffle.
  const entrance = useEntrance(`${label}:${value}`, { rise: 3 });

  return (
    <Animated.View
      style={[styles.card, style, { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}
    >
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: tones[tone].text }]} />
        <Text style={styles.label} numberOfLines={2}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={[styles.value, { color: tones[tone].text }]} numberOfLines={1}>
        {value}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    flexGrow: 1,
    flexBasis: '46%',
    ...shadows.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  label: {
    ...typography.label,
    color: colors.textSubtle,
    flex: 1,
  },
  value: { ...typography.metric },
  caption: { ...typography.caption, color: colors.textSubtle },
});
