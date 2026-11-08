/**
 * TRACK — shared button.
 *
 * Five variants and a strict hierarchy: `primary` is the navy you press once,
 * `tonal` is the pale brand blue for a secondary action that still matters,
 * `secondary` is an outlined surface for "not now", `text` is bare type for the thing
 * that cancels, and `danger` is the one filled red. A screen with two filled buttons
 * is a screen that has not decided what it wants you to do.
 *
 * Geometry follows the app's touch rule — 44dp for a control you aim at with a thumb,
 * 36dp for the compact ones inside a row — and the corner is the 12dp control radius,
 * not a pill: a pill on a rectangle reads as a chip, and a chip is not a verb.
 *
 * Press feedback is a 1.5% scale driven by React Native's own Animated, plus one
 * haptic tick, so a control answers the finger instead of merely dimming.
 */
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, touch, typography } from '../../theme';
import { usePress } from '../../anim';
import { hapticImpact } from '../../haptics';

/**
 * `usePress` hands back an interpolation, and a plain `Pressable` style only takes
 * numbers. The animated flavour of Pressable is the one control that accepts it, so
 * the whole button — background included — is what scales under the finger.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Glyph = ComponentProps<typeof Ionicons>['name'];

type ButtonProps = {
  onPress?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'tonal' | 'secondary' | 'text' | 'danger';
  size?: 'sm' | 'md';
  /** Full-width block button (forms, sheet footers). */
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: Glyph;
  /** Put the icon after the label — used for "Next" and "Open" affordances. */
  iconPosition?: 'left' | 'right';
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const { onPressIn, onPressOut, pressStyle } = usePress({ restingOpacity: inactive ? 0.5 : 1 });

  const foreground =
    variant === 'primary' || variant === 'danger'
      ? colors.onNavy
      : variant === 'tonal'
        ? colors.blueText
        : colors.navy;

  const glyph =
    icon && !loading ? <Ionicons name={icon} size={size === 'sm' ? 15 : 17} color={foreground} /> : null;

  return (
    <AnimatedPressable
      onPress={() => {
        if (inactive) return;
        hapticImpact('light');
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inactive}
      hitSlop={4}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        variantStyles[variant],
        block && styles.block,
        pressStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {iconPosition === 'left' ? glyph : null}
          <Text style={[styles.label, size === 'sm' ? styles.labelSm : styles.labelMd, { color: foreground }]}>
            {children}
          </Text>
          {iconPosition === 'right' ? glyph : null}
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.control,
  },
  md: { minHeight: touch.target, paddingHorizontal: spacing.lg },
  sm: { minHeight: touch.inline, paddingHorizontal: spacing.md },
  block: { alignSelf: 'stretch' },
  label: { ...typography.buttonText, textAlign: 'center' },
  labelMd: { fontSize: 15 },
  labelSm: { fontSize: 13 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.navy },
  tonal: { backgroundColor: colors.blueTint },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  text: { backgroundColor: 'transparent', paddingHorizontal: spacing.sm },
  danger: { backgroundColor: colors.red },
});
