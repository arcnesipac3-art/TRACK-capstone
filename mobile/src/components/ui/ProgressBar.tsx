/**
 * TRACK — 4dp progress bar.
 *
 * KA draws progress as a hairline, not a chunky gauge: a 4dp track the full
 * width of its card, filled with the instructive blue, and the numbers printed
 * beside or above it rather than inside it. The three-state colours (grey =
 * untouched, amber = attempted, green = complete) are hers, so a row of bars
 * reads as mastery rather than as a percentage.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

type ProgressBarProps = {
  /** 0–100 (a percentage), clamped. Values outside it are read as 0–1 ratios. */
  value: number;
  label?: string;
  /** Right-aligned counter, e.g. `2,260/13,000 (17%)`. */
  detail?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red';
};

const FILL: Record<string, string> = {
  blue: colors.blue,
  green: colors.green,
  amber: colors.gold,
  red: colors.red,
};

export default function ProgressBar({ value, label, detail, tone = 'blue' }: ProgressBarProps) {
  const ratio = value > 1 ? value / 100 : value;
  const pct = Math.round(Math.min(100, Math.max(0, ratio * 100)));

  return (
    <View style={styles.wrap}>
      {label || detail ? (
        <View style={styles.legend}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
      ) : null}
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={label ? `${label}: ${pct}%` : `${pct}%`}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: FILL[tone] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  legend: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  label: { ...typography.muted, fontWeight: '700', color: colors.navy },
  detail: { ...typography.subtle },
  track: {
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.sm },
});
