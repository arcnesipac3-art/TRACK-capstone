/**
 * TRACK — progress, drawn once and animated into place.
 *
 * The old bar was 4dp of the page background with a number beside it — accurate, and
 * invisible at a glance on a phone held at arm's length. A 10dp track with a rounded
 * cap reads as a gauge without needing the number, and the number is still printed
 * because a gauge alone cannot tell you it is ₱12,400 of ₱48,000.
 *
 * The fill grows from zero once on layout. Layout properties cannot go through the
 * native driver, so this runs on the JS thread — one animation per visible card, never
 * one per row.
 */
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useGrow } from '../../anim';
import { colors, radius, spacing, toneHue, typography } from '../../theme';

type ProgressBarProps = {
  /** 0–100 (a percentage), clamped. Values outside it are read as 0–1 ratios. */
  value: number;
  label?: string;
  /** Right-aligned counter, e.g. `₱12,400 / ₱48,000 (26%)`. */
  detail?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'navy';
  /** A quiet track when the bar sits inside a card that already has a border. */
  thickness?: 'thin' | 'regular' | 'thick';
};

const HEIGHT = { thin: 6, regular: 10, thick: 14 };

export default function ProgressBar({
  value,
  label,
  detail,
  tone = 'blue',
  thickness = 'regular',
}: ProgressBarProps) {
  const ratio = value > 1 ? value / 100 : value;
  const pct = Math.round(Math.min(100, Math.max(0, ratio * 100)));
  const width = useGrow(pct / 100);

  return (
    <View style={styles.wrap}>
      {label || detail ? (
        <View style={styles.legend}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
      ) : null}
      <View
        style={[styles.track, { height: HEIGHT[thickness] }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label ? `${label}: ${pct}%` : `${pct}%`}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <Animated.View
          style={[
            styles.fill,
            { width, height: HEIGHT[thickness], backgroundColor: toneHue[tone] },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  legend: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { ...typography.subhead },
  detail: { ...typography.subtle },
  track: {
    borderRadius: radius.pill,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { borderRadius: radius.pill },
});
