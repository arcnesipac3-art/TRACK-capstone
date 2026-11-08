/**
 * TRACK — segmented control with a sliding indicator.
 *
 * Segments used to change colour, which means the eye has to compare five tiles to work
 * out what is selected. One navy capsule marks the pick instead: the selection is a place,
 * and moving it is a movement you can see.
 *
 * Five labels will not share a 360dp phone at a readable size, so past four segments the
 * strip becomes fixed-width and scrolls sideways rather than squeezing "Assessments" into
 * "Assess". There the capsule is a single tile that travels, because a capsule that jumps
 * from tile to tile cannot show the distance it covered.
 *
 * The two cases are deliberately different in how they are sized. A scrolling strip knows
 * its own tile width, so one animated value is enough. A shared-width strip divides the
 * screen by the number of segments, and nothing in the component needs to know the pixel
 * result — each tile fades its own capsule in. Waiting for a measured track instead left
 * the control blank on builds that never report a layout.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScrollViewInstance, StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, touch, typography } from '../../theme';
import { startMotion } from '../../anim';
import { hapticSelection } from '../../haptics';
import { tabSelected } from '../../a11y';

export type SegmentedOption<T extends string> = {
  label: string;
  value: T;
  /** Shown after the label, so a tab with no results can be seen as empty. */
  count?: number;
};

const FIXED_CELL = 104;

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
};

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  scrollable,
}: SegmentedControlProps<T>) {
  // Past four segments the labels need more room than the phone has, so the strip stops
  // sharing the width and starts scrolling.
  const scrolls = scrollable ?? options.length > 4;
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  // The capsule starts at the pick rather than at the first tile: a control that opens
  // already two segments in has to show the truth on its first frame, before any
  // animation gets a chance to run.
  const [slide] = useState(() => new Animated.Value(index * FIXED_CELL));
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!scrolls) return;
    startMotion(slide, {
      toValue: index * FIXED_CELL,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  }, [index, scrolls, slide]);

  // A scrolling strip that never moves is a strip whose last segments do not exist. The
  // pick lands one cell in from the edge, so it is fully visible and the next one is still
  // a thumb-swipe away. The offset is counted in cells rather than in viewport widths:
  // the scroller clamps whatever is past its end, and asking it to clamp is cheaper than
  // measuring it.
  useEffect(() => {
    if (!scrolls) return;
    scroller.current?.scrollTo({ x: Math.max(0, (index - 1) * FIXED_CELL), y: 0, animated: true });
  }, [scrolls, index]);

  return (
    <View style={[styles.frame, style]}>
      <ScrollView
        ref={scroller}
        horizontal
        scrollEnabled={scrolls}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={scrolls ? styles.innerFixed : styles.innerShared}
        accessibilityRole="tablist"
      >
        {scrolls ? (
          <View pointerEvents="none" style={styles.indicatorHolder}>
            <Animated.View
              style={[styles.indicator, { transform: [{ translateX: slide }] }]}
            />
          </View>
        ) : null}
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                hapticSelection();
                onChange(option.value);
              }}
              style={[styles.segment, scrolls ? { width: FIXED_CELL } : styles.segmentShared]}
              accessibilityRole="tab"
              {...tabSelected(active)}
            >
              {!scrolls ? <Pill active={active} /> : null}
              <Text style={[styles.label, active ? styles.labelActive : null]} numberOfLines={1}>
                {option.label}
                {option.count !== undefined ? (
                  <Text style={[styles.count, active ? styles.countActive : null]}>
                    {` ${option.count}`}
                  </Text>
                ) : null}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The capsule of a shared-width strip: it owns its segment, so it needs no geometry. */
function Pill({ active }: { active: boolean }) {
  const [fade] = useState(() => new Animated.Value(active ? 1 : 0));

  useEffect(() => {
    startMotion(fade, {
      toValue: active ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  }, [active, fade]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pill,
        {
          opacity: fade,
          transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.xxs,
    overflow: 'hidden',
  },
  innerShared: { flexDirection: 'row', flexGrow: 1 },
  innerFixed: { flexDirection: 'row', gap: 0 },
  indicatorHolder: {
    position: 'absolute',
    left: spacing.xxs,
    top: spacing.xxs,
    width: FIXED_CELL,
    height: touch.target,
  },
  indicator: {
    height: touch.target,
    width: FIXED_CELL - spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    height: touch.target,
  },
  segmentShared: { flex: 1 },
  /** Inset by the same 4dp total the travelling capsule leaves at its edges. */
  pill: {
    position: 'absolute',
    left: spacing.xxs,
    right: spacing.xxs,
    top: 0,
    bottom: 0,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
  },
  label: { ...typography.buttonText, fontSize: 13, color: colors.textMuted },
  labelActive: { color: colors.onNavy },
  /** The count rides the label, so it steps back a size rather than competing with it. */
  count: { ...typography.micro, color: colors.textSubtle },
  countActive: { color: colors.onNavyMuted },
});
