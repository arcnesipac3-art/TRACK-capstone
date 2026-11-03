/**
 * TRACK — the surface every block of content sits on.
 *
 * Khan Academy lays a page out as white cards on an off-white wash: one hairline
 * border, an 8dp corner and no shadow. Shadow is reserved for things that
 * genuinely float (the tab island, menus, modals), so a card never looks like a
 * button unless it is one — pass `onPress` and it becomes a full-width row you
 * can tap.
 */
import type { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';

type CardProps = {
  children: ReactNode;
  /** Makes the whole card one tap target (KA's course rows work this way). */
  onPress?: () => void;
  /** Drop the inner padding when the content brings its own (rows, tables). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Card({ children, onPress, padded = true, style }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, !padded && styles.tight, style]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, !padded && styles.tight, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  /** Full-bleed rows would square off the rounded corners; clip them here, and only here. */
  tight: {
    padding: 0,
    overflow: 'hidden',
  },
});
