/**
 * TRACK — the single action a screen exists to enable.
 *
 * Three shapes, chosen by how much the action needs to say:
 *   - circular: one glyph, 56dp, the classic.
 *   - extended: glyph + label, so "Record payment" never has to be guessed.
 *   - inline: no absolute positioning, for a FAB that belongs to a scroll body
 *     rather than floating over it.
 *
 * Colour is `brand` (navy) by default: the bright blue is 3.1:1 on white, which
 * is fine for a bar or a dot and not fine for the one button on the screen that
 * everyone has to find.
 */
import type { ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, shadows, spacing, typography } from '../../theme';
import { usePress } from '../../anim';
import { hapticImpact } from '../../haptics';

type Glyph = ComponentProps<typeof Ionicons>['name'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type FabProps = {
  onPress: () => void;
  icon?: Glyph;
  label?: string;
  tone?: 'brand' | 'blue' | 'danger';
  /** Absolute bottom-right placement. Off for a FAB that scrolls with content. */
  floating?: boolean;
  /** Extra bottom clearance when floating, on top of the safe area. */
  clearance?: number;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const FILL = {
  brand: colors.navy,
  blue: colors.blue,
  danger: colors.red,
} as const;

export default function Fab({
  onPress,
  icon = 'add',
  label,
  tone = 'brand',
  floating = false,
  clearance = 0,
  disabled = false,
  testID,
  accessibilityLabel,
  style,
}: FabProps) {
  const { onPressIn, onPressOut, pressStyle } = usePress();

  const button = (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        hapticImpact('medium');
        onPress();
      }}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? 'Add'}
      testID={testID}
      hitSlop={8}
      style={[
        styles.base,
        label ? styles.extended : styles.circular,
        { backgroundColor: FILL[tone] },
        shadows.md,
        disabled && styles.disabled,
        !disabled && pressStyle,
        style,
      ]}
    >
      <Ionicons name={icon} size={label ? 20 : 26} color={colors.onNavy} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </AnimatedPressable>
  );

  if (!floating) return button;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: spacing.lg + clearance }]}>
      {button}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: spacing.lg,
    left: 0,
    alignItems: 'flex-end',
  },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  circular: {
    width: 56,
    height: 56,
    borderRadius: radius.xl + 4,
  },
  extended: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  label: {
    ...typography.buttonText,
    color: colors.onNavy,
  },
  disabled: { opacity: 0.5 },
});
