/**
 * TRACK — week day selector.
 *
 * The timetable was a vertical list of every class on every day, which is a
 * spreadsheet, not a phone screen. A week strip puts the seven days under a thumb,
 * marks the one you are looking at with a capsule that slides between them, and
 * dots the days that actually hold a class, so an empty Wednesday reads as empty
 * without counting anything.
 *
 * The indicator is one absolutely-positioned pill animated with `translateX` rather
 * than a recoloured cell per day: it moves, so the change is legible as movement.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { startMotion } from '../../anim';
import { colors, radius, spacing, typography } from '../../theme';
import { hapticSelection } from '../../haptics';
import { tabSelected } from '../../a11y';

export type DayOption = {
  /** ISO weekday the API uses: 1 = Monday … 7 = Sunday. */
  value: number;
  /** Two-letter stub for the strip. */
  short: string;
  /** Date number under the letter, e.g. 4. */
  date?: number;
  /** True when the day holds at least one class or session. */
  hasContent?: boolean;
  /** Today, marked independently of the selection. */
  isToday?: boolean;
};

/** One cell. Seven of these plus padding clear a 360dp phone with nothing truncated. */
const CELL_WIDTH = 46;
const CELL_HEIGHT = 56;

type DaySelectorProps = {
  days: DayOption[];
  value: number;
  onChange: (value: number) => void;
};

export default function DaySelector({ days, value, onChange }: DaySelectorProps) {
  const [measured, setMeasured] = useState(false);
  const [slide] = useState(() => new Animated.Value(0));
  const index = Math.max(0, days.findIndex((day) => day.value === value));

  // The capsule can only travel a distance it has measured, so the strip reports
  // its own width on the first layout and the slide is armed after that.
  useEffect(() => {
    if (!measured) return;
    startMotion(slide, {
      toValue: index * CELL_WIDTH,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  }, [index, measured, slide]);

  return (
    <View style={styles.frame} onLayout={() => setMeasured(true)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.inner}
        accessibilityRole="tablist"
      >
        <View pointerEvents="none" style={styles.indicatorHolder}>
          <Animated.View
            style={[
              styles.indicator,
              { opacity: measured ? 1 : 0, transform: [{ translateX: slide }] },
            ]}
          />
        </View>
        {days.map((day) => {
          const active = day.value === value;
          return (
            <Pressable
              key={day.value}
              onPress={() => {
                hapticSelection();
                onChange(day.value);
              }}
              style={styles.stop}
              accessibilityRole="tab"
              {...tabSelected(active)}
              accessibilityLabel={`Day ${day.short}${day.date ? ` ${day.date}` : ''}`}
            >
              <Text style={[styles.short, active ? styles.shortActive : null]}>{day.short}</Text>
              {day.date !== undefined ? (
                <Text
                  style={[
                    styles.date,
                    active ? styles.dateActive : null,
                    day.isToday && !active ? styles.dateToday : null,
                  ]}
                >
                  {day.date}
                </Text>
              ) : null}
              <View
                style={[
                  styles.dot,
                  day.hasContent ? styles.dotOn : null,
                  active ? styles.dotActive : null,
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.surface },
  inner: { flexDirection: 'row', padding: spacing.xs },
  indicatorHolder: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  },
  indicator: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    borderRadius: radius.control,
    backgroundColor: colors.navy,
  },
  stop: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  short: { ...typography.micro, fontSize: 11, color: colors.textSubtle },
  shortActive: { color: colors.onNavyMuted },
  date: { ...typography.subhead, fontSize: 16, color: colors.textMuted },
  dateActive: { color: colors.onNavy },
  dateToday: { color: colors.blueText },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.blue },
  dotActive: { backgroundColor: colors.gold },
});
