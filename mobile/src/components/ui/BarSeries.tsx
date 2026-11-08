/**
 * TRACK — comparison bars.
 *
 * The fee screen had three numbers and a table; the attendance section had four
 * tiles. Neither showed a proportion, which is the only thing a school administrator
 * reading "assessed / collected / outstanding" actually wants to see.
 *
 * These are horizontal bars, one per category, drawn to the largest value in the set
 * rather than to 100 — so a category that is half the size of the leader looks half
 * the size. Every figure is the server's own; the bar is a picture of a number that is
 * printed next to it, never a number invented for the picture.
 *
 * Width animates once on layout. Layout properties cannot use the native driver, so
 * this runs on the JS thread exactly one time per visible set.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { startMotion } from '../../anim';
import { colors, radius, spacing, toneHue, typography, type Tone } from '../../theme';

export type BarDatum = {
  key: string;
  label: string;
  /** The value the bar is drawn to. */
  value: number;
  /** Printed as the row figure; pass the formatted string (₱, %, count). */
  display?: string;
  tone?: Tone;
  /** Secondary line — e.g. `of ₱48,000 assessed`. */
  detail?: string;
};

type BarSeriesProps = {
  data: BarDatum[];
  /** Values are drawn against this; defaults to the largest in the set. */
  scaleTo?: number;
  /** A legend line for what the bars measure. */
  caption?: string;
};

export default function BarSeries({ data, scaleTo, caption }: BarSeriesProps) {
  const [t] = useState(() => new Animated.Value(0));
  const max = scaleTo ?? Math.max(1, ...data.map((datum) => datum.value));

  useEffect(() => {
    t.setValue(0);
    startMotion(t, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
  }, [t, max, data.length]);

  return (
    <View style={styles.wrap}>
      {data.map((datum) => {
        const ratio = Math.max(0, Math.min(1, datum.value / max));
        return (
          <View key={datum.key} style={styles.row}>
            <View style={styles.legend}>
              <Text style={styles.label} numberOfLines={1}>
                {datum.label}
              </Text>
              <Text style={styles.figure} numberOfLines={1}>
                {datum.display ?? datum.value}
              </Text>
            </View>
            <View style={styles.track} accessibilityRole="progressbar">
              <Animated.View
                style={[
                  styles.fill,
                  {
                    width: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', `${ratio * 100}%`],
                    }),
                    backgroundColor: toneHue[datum.tone ?? 'blue'],
                  },
                ]}
              />
            </View>
            {datum.detail ? <Text style={styles.detail}>{datum.detail}</Text> : null}
          </View>
        );
      })}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  row: { gap: spacing.xs },
  legend: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  label: { ...typography.subhead },
  figure: { ...typography.muted, fontWeight: '700', color: colors.navy },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.quietFill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  detail: { ...typography.subtle },
  caption: { ...typography.subtle, color: colors.textSubtle },
});
