/**
 * TRACK — the surface every block of content sits on.
 *
 * A page lays out as cards on a cool wash. Content does not float here: a card is a
 * hairline and a corner, and shadow is spent only on things that genuinely rise — the
 * tab island, a sheet, a menu. That is what keeps a page of cards from looking like a
 * page of buttons.
 *
 * `well` is the inset variant: a slightly darker fill with no border, used where a
 * block is a container for other blocks rather than a statement of its own. `brand`
 * carries the navy, for the one panel per screen that should outvote the rest.
 */
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { usePress } from '../../anim';
import { hapticImpact } from '../../haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type CardProps = {
  children: ReactNode;
  /** Makes the whole card one tap target. */
  onPress?: () => void;
  /** Drop the inner padding when the content brings its own (rows, tables). */
  padded?: boolean;
  variant?: 'surface' | 'well' | 'brand';
  /** Tighter padding for a card that holds one figure, not a list. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Card({
  children,
  onPress,
  padded = true,
  variant = 'surface',
  compact = false,
  style,
}: CardProps) {
  const surface = variantStyles[variant];
  const { onPressIn, onPressOut, pressStyle } = usePress();

  const box = [
    styles.base,
    surface,
    padded ? (compact ? styles.compact : styles.padded) : styles.tight,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={() => {
          hapticImpact('light');
          onPress();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[...box, pressStyle]}
        accessibilityRole="button"
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={box}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg },
  padded: { padding: spacing.lg, gap: spacing.sm },
  compact: { padding: spacing.md, gap: spacing.xs },
  /** Full-bleed rows would square off the rounded corners; clip them here, and only here. */
  tight: { padding: 0, overflow: 'hidden' },
});

const variantStyles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  well: { backgroundColor: colors.quietFill },
  brand: { backgroundColor: colors.navy },
});
