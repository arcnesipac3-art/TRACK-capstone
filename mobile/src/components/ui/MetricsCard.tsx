/**
 * TRACK — one surface, several numbers.
 *
 * A dashboard used to be twelve white boxes, each with a label and a figure, and the
 * eye had to visit twelve borders to read one page. That is the "repetitive statistic
 * boxes" problem exactly: the container count grew with the number count.
 *
 * Here the metrics share one card and are separated by rules, so the card count says
 * how many subjects the page has and the rules say how many figures each subject
 * holds. The lead metric is set larger, because on any screen one number is the
 * reason the section exists and the rest are its context.
 */
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useEntrance } from '../../anim';
import { colors, radius, spacing, toneHue, typography, type Tone } from '../../theme';

export type Metric = {
  key: string;
  label: string;
  /** Already formatted — a count, `₱12,400`, `93%`. The card does not know the units. */
  value: string;
  tone?: Tone;
  /** Sub-line: a name, a date, a comparison. */
  detail?: string;
};

type MetricsCardProps = {
  items: Metric[];
  /** How many metrics per row before the card breaks to the next line. */
  columns?: 2 | 3;
  /** The first metric is drawn as the headline of the card. */
  lead?: boolean;
  /** One quiet line under the whole grid — what the figures were measured against. */
  footnote?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function MetricsCard({
  items,
  columns = 2,
  lead = false,
  footnote,
  onPress,
  style,
}: MetricsCardProps) {
  const rows: Metric[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  // The card counts, so it is the figures that identify it: a new set of numbers
  // arrives as new content, a re-render of the same ones stays put.
  const entrance = useEntrance(items.map((item) => `${item.key}:${item.value}`).join('|'), {
    rise: 3,
  });

  return (
    <Animated.View
      style={[
        styles.card,
        style,
        { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] },
      ]}
    >
      {rows.map((row, rowIndex) => (
        <View key={row[0]?.key ?? rowIndex} style={styles.row}>
          {row.map((metric, cellIndex) => {
            const isLead = lead && rowIndex === 0 && cellIndex === 0;
            return (
              <View
                key={metric.key}
                style={[
                  styles.cell,
                  cellIndex > 0 && styles.cellDivided,
                  rowIndex > 0 ? null : null,
                  rowIndex < rows.length - 1 ? styles.cellRowBottom : null,
                ]}
              >
                <Text style={styles.label} numberOfLines={2}>
                  {metric.label}
                </Text>
                <Text
                  style={[
                    isLead ? styles.leadValue : styles.value,
                    { color: metric.tone ? toneHue[metric.tone] : colors.navy },
                  ]}
                  numberOfLines={1}
                >
                  {metric.value}
                </Text>
                {metric.detail ? (
                  <Text style={styles.detail} numberOfLines={2}>
                    {metric.detail}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {/* A short last row keeps its cells the width they would have had full. */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, gap) => (
                <View key={`gap-${gap}`} style={styles.cell} />
              ))
            : null}
        </View>
      ))}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      {onPress ? (
        <Text accessibilityRole="link" onPress={onPress} style={styles.openHint}>
          Open
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  row: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, gap: spacing.xxs },
  cellDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    paddingLeft: spacing.lg,
    marginLeft: -spacing.lg,
  },
  cellRowBottom: { paddingBottom: spacing.lg, marginBottom: -spacing.lg },
  label: { ...typography.label, color: colors.textSubtle },
  value: { ...typography.metric, fontSize: 22, lineHeight: 26 },
  leadValue: { ...typography.figure, fontSize: 30, lineHeight: 34 },
  detail: { ...typography.subtle },
  footnote: { ...typography.subtle, color: colors.textSubtle },
  openHint: { display: 'none' },
});
