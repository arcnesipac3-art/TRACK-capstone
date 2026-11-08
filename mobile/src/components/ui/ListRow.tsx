/**
 * TRACK — the row every list in the app is built from.
 *
 * A row is a mark on the left (an initials avatar, an icon chip or a colour bar), a
 * name, one quiet line about it, and the fact on the right that makes it worth
 * reading — a count, an amount, a status. The chevron says it goes somewhere; a row
 * that only displays has no chevron, so nobody hunts for a tap that does nothing.
 *
 * Before this pass the primitive existed and nothing below the four dashboards used
 * it: every module list hand-rolled its own `View` inside a card, which is how two
 * screens ended up showing the same data in three different type sizes.
 *
 * `onLongPress` opens a contextual ActionMenu, which is how a row keeps one visible
 * action instead of four competing buttons on its face.
 */
import type { ComponentProps, ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, toneHue, tones, typography, type Tone } from '../../theme';
import { usePress } from '../../anim';
import { hapticImpact } from '../../haptics';
import Avatar from './Avatar';

/**
 * `usePress` hands back an interpolation, and only the animated flavour of a
 * `Pressable` accepts one in its style — the same reason `Button` wraps it.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Glyph = ComponentProps<typeof Ionicons>['name'];

type ListRowProps = {
  title: string;
  /** One line under the title — only what the title cannot say. */
  subtitle?: string;
  /** A second supporting line, for the rare row that carries three facts. */
  detail?: string;
  /** Right-aligned figure: a count, an amount, a time. */
  meta?: string;
  /** Replaces `meta` when the right side needs a badge or a control instead. */
  trailing?: ReactNode;
  /** A person's name: draws the initials disc instead of an icon chip. */
  avatar?: string;
  icon?: Glyph;
  tone?: Tone;
  /** Overrides the chip's hue without changing its tint. */
  hue?: string;
  /** A 3dp brand bar down the leading edge, for a row whose colour is the meaning. */
  accent?: Tone;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  /** Marks the row the screen is currently filtered to. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function ListRow({
  title,
  subtitle,
  detail,
  meta,
  trailing,
  avatar,
  icon,
  tone = 'blue',
  hue,
  accent,
  onPress,
  onLongPress,
  chevron = true,
  divider = false,
  selected = false,
  style,
}: ListRowProps) {
  const chip = tones[tone] ?? tones.blue;
  const { onPressIn, onPressOut, pressStyle } = usePress();

  const leading = avatar ? (
    <Avatar name={avatar} size="md" hue={hue} />
  ) : icon ? (
    <View style={[styles.chip, { backgroundColor: selected ? colors.navy : chip.background }]}>
      <Ionicons
        name={icon}
        size={20}
        color={selected ? colors.onNavy : hue ?? chip.text}
      />
    </View>
  ) : accent ? (
    <View style={[styles.accentBar, { backgroundColor: toneHue[accent] }]} />
  ) : null;

  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? (meta ? <Text style={styles.meta}>{meta}</Text> : null)}
      {onPress && chevron ? (
        <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
      ) : null}
    </>
  );

  if (onPress || onLongPress) {
    return (
      <AnimatedPressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={
          onPress
            ? () => {
                hapticImpact('light');
                onPress();
              }
            : undefined
        }
        onLongPress={
          onLongPress
            ? () => {
                hapticImpact('medium');
                onLongPress();
              }
            : undefined
        }
        style={[
          styles.row,
          divider && styles.divider,
          selected && styles.selected,
          pressStyle,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`}
      >
        {body}
      </AnimatedPressable>
    );
  }

  return <View style={[styles.row, divider && styles.divider, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.blueWash },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  leading: { flexShrink: 0 },
  chip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentBar: { width: 3, height: 34, borderRadius: 2 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.subhead },
  subtitle: { ...typography.caption },
  detail: { ...typography.subtle },
  meta: { ...typography.muted, fontWeight: '700', color: colors.navy, flexShrink: 0 },
});
