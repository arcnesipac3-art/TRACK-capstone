/**
 * TRACK — section heading, with a count and exactly one way forward.
 *
 * A page is read as a sequence of subjects before it is read as content, so the heading
 * carries the subject, how many things are in it, and the one action that opens the full
 * screen. Two competing links turn a heading into a menu, which is why `actionLabel` is
 * the only affordance here.
 *
 * The count matters: "Fees · 12 assessments" tells an administrator whether the section
 * is worth opening at all, and it is the server's own number, never a length of whatever
 * page of results happens to be loaded.
 */
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tones, typography, type Tone } from '../../theme';
import { hapticImpact } from '../../haptics';

type Glyph = ComponentProps<typeof Ionicons>['name'];

type SectionHeaderProps = {
  title: string;
  /** Supporting line under the title, for a filter that is active. */
  detail?: string;
  /** How many things the section holds, printed as a chip beside the title. */
  count?: number;
  /** The count's noun, so the chip reads `12 assessments` at a glance. */
  countNoun?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: Glyph;
  /** Colour the count chip; matches the status the section is about. */
  countTone?: Tone;
};

export default function SectionHeader({
  title,
  detail,
  count,
  countNoun,
  actionLabel,
  onAction,
  actionIcon,
  countTone,
}: SectionHeaderProps) {
  const chip = tones[countTone ?? 'gray'];

  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>{title}</Text>
          {count !== undefined ? (
            <View style={[styles.count, { backgroundColor: chip.background }]}>
              <Text style={[styles.countText, { color: chip.text }]}>{count}</Text>
            </View>
          ) : null}
        </View>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            hapticImpact('light');
            onAction();
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel} — ${title}`}
        >
          {actionIcon ? (
            <Ionicons name={actionIcon} size={14} color={colors.blueText} />
          ) : null}
          <Text style={styles.actionLabel}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.blueText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.heading },
  count: {
    minWidth: 22,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { ...typography.micro },
  detail: { ...typography.subtle },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
  },
  actionPressed: { backgroundColor: colors.blueTint },
  actionLabel: { ...typography.buttonText, fontSize: 13, color: colors.blueText },
});
