/**
 * TRACK — shared segmented control.
 *
 * A bordered white track with one tinted segment: Khan Academy marks the
 * selected filter with its pale instructive blue rather than a raised white
 * pill, which keeps the row flat and leaves the shadow vocabulary for things
 * that actually float. 40dp segments so the row stays tappable with a thumb.
 *
 * Replaces the three divergent per-screen implementations (NoticesScreen,
 * admin/attendance, admin/directory) that had different metrics.
 *
 * The segments grow to fill the row when there is room and keep their own
 * width when there is not, so a five-tab strip on a small phone scrolls
 * sideways instead of squeezing "Assessments" into "Assess".
 */
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

export type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.frame, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.inner}
        accessibilityRole="tablist"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onChange(option.value)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  inner: {
    flexDirection: 'row',
    gap: spacing.xs,
    // Growing the content to the frame is what lets the segments share the
    // width; `flexShrink: 0` on each segment is what stops them being squeezed
    // below their label once they cannot.
    flexGrow: 1,
  },
  segment: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  segmentActive: {
    backgroundColor: colors.blueTint,
  },
  label: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.blueText,
  },
});
