/**
 * TRACK — shared button.
 *
 * Khan Academy's button set: one filled instructive blue, one white button with
 * a hairline border, and a red-bordered destructive one. Blue is reserved for
 * the action you want taken, which is why the primary variant is the only filled
 * surface here. Geometry follows the app's touch rule — 44dp for a button you
 * aim at with a thumb, 36 for the compact ones inside a row — and the 4dp corner
 * KA uses, not a pill.
 *
 * Replaces the six per-screen copies that had drifted apart (different paddings,
 * radii and disabled opacities).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

type ButtonProps = {
  onPress?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  /** Full-width block button (forms, modals). */
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
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
  accessibilityLabel,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const spinnerColor =
    variant === 'primary' ? colors.onNavy : variant === 'danger' ? colors.redText : colors.navy;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        variantStyles[variant],
        block && styles.block,
        inactive && styles.inactive,
        style,
      ]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <Text style={[styles.label, size === 'sm' ? styles.labelSm : styles.labelMd, labelStyles[variant]]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
  },
  md: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  block: {
    alignSelf: 'stretch',
  },
  inactive: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '700',
    textAlign: 'center',
  },
  labelMd: {
    ...typography.buttonText,
  },
  labelSm: {
    ...typography.buttonText,
    fontSize: 14,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.blue,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.redText,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: colors.onNavy,
  },
  secondary: {
    color: colors.navy,
  },
  danger: {
    color: colors.redText,
  },
  ghost: {
    color: colors.blue,
  },
});
