/**
 * TRACK — shared button.
 *
 * One implementation of the website's button set (frontend .btn variants):
 * navy primary, white secondary with strong border, danger, and ghost.
 * Replaces the six per-screen copies that had drifted apart (different
 * paddings, radii and disabled opacities).
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, shadows } from '../../theme';

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
    variant === 'primary' ? colors.onNavy : variant === 'danger' ? colors.red700 : colors.navy800;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        variantStyles[variant],
        variant === 'primary' && shadows.sm,
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
    minHeight: 42,
    paddingHorizontal: spacing.lg,
  },
  sm: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
  },
  block: {
    alignSelf: 'stretch',
  },
  inactive: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '600',
    textAlign: 'center',
  },
  labelMd: {
    fontSize: 15,
  },
  labelSm: {
    fontSize: 13,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.navy800,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.red700,
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
    color: colors.navy800,
  },
  danger: {
    color: colors.red700,
  },
  ghost: {
    color: colors.textMuted,
  },
});
