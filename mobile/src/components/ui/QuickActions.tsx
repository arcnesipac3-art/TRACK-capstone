/**
 * TRACK — the four things this screen exists to let you do next.
 *
 * A dashboard that only reports is a report. These cells are verbs: each one
 * lands somewhere that can be acted in, so the shortcut is worth the thumb.
 *
 * Laid out three to a row and allowed to wrap, because a phone is 360dp wide
 * and a fourth column would put 82dp cells next to each other — under the touch
 * floor the moment a label wrapped.
 */
import type { ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tones, typography } from '../../theme';
import type { Tone } from '../../theme';
import { usePress } from '../../anim';
import { hapticImpact } from '../../haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Glyph = ComponentProps<typeof Ionicons>['name'];

export type QuickAction = {
  key: string;
  label: string;
  icon: Glyph;
  tone?: Tone;
  /** Where the label cannot say it: "3 pending". */
  detail?: string;
  onSelect: () => void;
  /** A permission the account does not have, phrased as the reason. */
  unavailable?: string;
};

export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.strip}>
      {actions.map((action, index) => (
        <Cell key={action.key} action={action} last={index === actions.length - 1} />
      ))}
    </View>
  );
}

function Cell({ action, last }: { action: QuickAction; last: boolean }) {
  const tone: Tone = action.tone ?? 'blue';
  const disabled = Boolean(action.unavailable);
  // The dim of an unavailable cell is the press animation's floor, not a static
  // rule: an animated `opacity` in the same style array overrides a static one
  // however they are ordered, so a stylesheet dim would never show.
  const { onPressIn, onPressOut, pressStyle } = usePress({ restingOpacity: disabled ? 0.45 : 1 });

  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        hapticImpact('light');
        action.onSelect();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={action.unavailable ?? action.label}
      accessibilityState={{ disabled }}
      testID={`quick-${action.key}`}
      style={[styles.cell, last && styles.cellLast, pressStyle]}
    >
      <View style={[styles.disc, { backgroundColor: tones[tone].background }]}>
        <Ionicons name={action.icon} size={19} color={tones[tone].text} />
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {action.label}
      </Text>
      {action.detail ? <Text style={styles.detail}>{action.detail}</Text> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  cell: {
    flexBasis: '33.333%',
    minWidth: 100,
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    minHeight: 92,
  },
  cellLast: { flexShrink: 1 },
  disc: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.micro,
    color: colors.text,
    textAlign: 'center',
  },
  detail: {
    ...typography.subtle,
    color: colors.textSubtle,
  },
});
