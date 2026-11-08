/**
 * TRACK — filter chip.
 *
 * A chip is a filter you can see is on. The Directory had five segments and the
 * Messages list had hand-rolled chips in two different sizes; neither told you
 * whether pressing it again would turn the filter off.
 *
 * Selected chips carry the brand as a fill, unselected ones as an outline, so the
 * state reads from across the room and does not depend on a tick.
 */
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, radius, spacing, touch, typography } from '../../theme';
import { usePress } from '../../anim';
import { hapticSelection } from '../../haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Glyph = ComponentProps<typeof Ionicons>['name'];

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** A count after the label — how many results this filter would show. */
  count?: number;
  icon?: Glyph;
  /** Tone for the selected fill, so a status filter keeps its colour when active. */
  tone?: 'brand' | 'navy';
  style?: StyleProp<ViewStyle>;
};

export default function Chip({
  label,
  selected = false,
  onPress,
  count,
  icon,
  tone = 'brand',
  style,
}: ChipProps) {
  const active = selected;
  const fill = tone === 'navy' ? colors.navy : colors.bluePress;
  const { onPressIn, onPressOut, pressStyle } = usePress();

  return (
    <AnimatedPressable
      onPress={() => {
        if (!onPress) return;
        hapticSelection();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={!onPress}
      hitSlop={4}
      style={[
        styles.chip,
        active ? { backgroundColor: fill, borderColor: fill } : null,
        pressStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !onPress }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.onNavy : colors.textMuted}
        />
      ) : null}
      <Text style={[styles.label, active ? styles.labelActive : null]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? (
        <View style={[styles.countWrap, active ? styles.countActive : null]}>
          <Text style={[styles.count, active ? styles.countLabelActive : null]}>{count}</Text>
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touch.inline,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: { ...typography.buttonText, fontSize: 13, color: colors.textMuted },
  labelActive: { color: colors.onNavy },
  countWrap: {
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.quietFill,
    alignItems: 'center',
  },
  countActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  count: { ...typography.micro, color: colors.textMuted },
  countLabelActive: { color: colors.onNavy },
});
